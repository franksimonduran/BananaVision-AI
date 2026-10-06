"""Strict importer for the included, unquantized TF.js Layers model.

Reconstructs the original graph and assigns EVERY weight by its manifest name.
No random fallback and no tensorflowjs/JAX conversion dependency.
"""
import copy
import json
from pathlib import Path
import numpy as np
import tensorflow as tf


def import_tfjs(path):
    path = Path(path)
    document = json.loads(path.read_text(encoding="utf-8-sig"))
    arrays = {}
    for group in document["weightsManifest"]:
        raw = b"".join((path.parent / name).read_bytes() for name in group["paths"])
        offset = 0
        for spec in group["weights"]:
            if spec["dtype"] != "float32" or "quantization" in spec:
                raise ValueError("Only unquantized float32 weights are supported")
            count = int(np.prod(spec["shape"]))
            size = count * 4
            if offset + size > len(raw):
                raise ValueError("Truncated weights file")
            if spec["name"] in arrays:
                raise ValueError("Duplicate weight name")
            arrays[spec["name"]] = np.frombuffer(raw, dtype="<f4", count=count, offset=offset).copy().reshape(spec["shape"])
            offset += size
        if offset != len(raw):
            raise ValueError("Unexpected bytes in weights file")
    used = set()
    def build(node):
        cls, config = node["class_name"], copy.deepcopy(node["config"])
        if cls == "Sequential":
            return tf.keras.Sequential([build(n) for n in config["layers"]], name=config["name"])
        if cls in ("Model", "Functional"):
            if len(config['input_layers']) != 1 or len(config['output_layers']) != 1:
                raise ValueError('Only single-input, single-output graphs are supported')
            tensors = {}
            for child in config["layers"]:
                name = child["config"]["name"]
                if child["class_name"] == "InputLayer":
                    c = child["config"]
                    tensors[name] = tf.keras.Input(shape=c["batch_input_shape"][1:], name=name)
                else:
                    links = child["inbound_nodes"]
                    if len(links) != 1 or any(link[1:3] != [0, 0] for link in links[0]):
                        raise ValueError("Unsupported graph connection")
                    inputs = [tensors[link[0]] for link in links[0]]
                    tensors[name] = build(child)(inputs if len(inputs) > 1 else inputs[0])
            return tf.keras.Model(
                tensors[config['input_layers'][0][0]],
                tensors[config['output_layers'][0][0]], name=config['name'])
        config.pop("batch_input_shape", None)
        layer_class = getattr(tf.keras.layers, cls, None)
        if layer_class is None:
            raise ValueError(f"Unsupported layer: {cls}")
        return layer_class.from_config(config)
    model = build(document["modelTopology"])
    model(np.zeros((1, 224, 224, 3), np.float32), training=False)
    def assign(layer):
        if isinstance(layer, tf.keras.Model):
            for child in layer.layers:
                assign(child)
            return
        for weight in layer.weights:
            short = weight.name.split(":")[0].split("/")[-1]
            if isinstance(layer, tf.keras.layers.DepthwiseConv2D) and short == "kernel":
                short = "depthwise_kernel"
            key = f"{layer.name}/{short}"
            if key not in arrays or tuple(weight.shape) != arrays[key].shape:
                raise ValueError(f"Missing or mismatched weight: {key}")
            weight.assign(arrays[key])
            used.add(key)
    assign(model)
    if used != set(arrays):
        raise ValueError(f"Unassigned weights: {set(arrays) - used}")
    return model
