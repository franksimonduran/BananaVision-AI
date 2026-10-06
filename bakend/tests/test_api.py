import base64
from io import BytesIO
from PIL import Image
from src.main import app
from src.api.routes import get_loader
from src.config import settings

def image(color='yellow'):
    out=BytesIO()
    Image.new('RGB',(360,240),color).save(out,format='PNG')
    return out.getvalue()

def upload(client,data=None):
    return client.post('/predict',files={'file':('test.png',image() if data is None else data,'image/png')})

def test_real_health_info_frontend(client):
    assert client.get('/health').json()['model_loaded'] is True
    info=client.get('/model/info').json()
    assert info['classes']==['NO APTO','APTO']
    assert info['input_shape']==[224,224,3]
    assert info['parameters']==538508
    assert 'BananaVision AI' in client.get('/').text
    assert client.get('/app.js').status_code==200

def test_real_prediction_and_json_parity(client):
    raw=image()
    a=upload(client,raw)
    b=client.post('/predict',json={'image':base64.b64encode(raw).decode()})
    c=client.post('/predict',json={'image':'data:image/png;base64,'+base64.b64encode(raw).decode()})
    assert a.status_code==b.status_code==c.status_code==200
    for res in (b,c):
        assert res.json()['probabilities']==a.json()['probabilities']
    d=a.json()
    assert abs(sum(d['probabilities'].values())-1)<1e-5
    assert d['predicted_class'] in ['APTO','NO APTO']
    assert d['conclusive']==(d['confidence']>=d['threshold'])
    assert 'no certifica' in d['scope']

class FixedModel:
    def __init__(self,confidence,label='APTO'):self.confidence,self.label=confidence,label
    def predict(self,arr):
        assert arr.shape==(1,224,224,3)
        probs={self.label:self.confidence,('NO APTO' if self.label=='APTO' else 'APTO'):1-self.confidence}
        return self.label,self.confidence,1.5,probs

def test_threshold_and_labels(client):
    for confidence,expected in [(.699,'NO CONCLUYENTE'),(.7,'APTO'),(.98,'APTO')]:
        app.dependency_overrides[get_loader]=lambda:FixedModel(confidence)
        d=upload(client).json()
        assert d['label']==expected
        assert d['predicted_class']=='APTO'
        assert bool(d['conclusive'])==(expected=='APTO')
    app.dependency_overrides[get_loader]=lambda:FixedModel(.95,'NO APTO')
    assert upload(client).json()['label']=='NO APTO'

def test_invalid_json_and_formats(client):
    for payload in [{},{'image':'!!!'},{'image':42},{'image':''},{'image':'data:text/plain;base64,YQ=='},{'image':'YQ==','extra':1}]:
        assert client.post('/predict',json=payload).status_code==400
    assert client.post('/predict',content='{',headers={'Content-Type':'application/json'}).status_code==400
    assert client.post('/predict',content='hello',headers={'Content-Type':'text/plain'}).status_code==415
    assert client.post('/predict',files={'file':('x.txt',b'text','text/plain')}).status_code==415
    assert client.post('/predict',files={'other':('x.png',image(),'image/png')}).status_code==400
    assert upload(client,b'not an image').status_code==400
    assert upload(client,b'').status_code==400

def test_upload_limits(client,monkeypatch):
    monkeypatch.setattr(settings,'MAX_IMAGE_SIZE_MB',1)
    assert upload(client,b'x'*(1024**2+1)).status_code==413
    assert client.post('/predict',json={'image':'A'*(2*1024**2)}).status_code==413
    monkeypatch.setattr(settings,'MAX_IMAGE_PIXELS',10)
    assert upload(client).status_code==400

def test_request_stream_limit_without_content_length(client,monkeypatch):
    monkeypatch.setattr(settings,'MAX_IMAGE_SIZE_MB',1)
    chunks=(b'x'*1024**2 for _ in range(4))
    assert client.post('/predict',content=chunks,headers={'Content-Type':'application/json'}).status_code==413

def test_batch_order_and_validation(client,monkeypatch):
    files=[('files',('a.png',image('yellow'),'image/png')),('files',('b.png',image('black'),'image/png'))]
    res=client.post('/predict/batch',files=files)
    assert res.status_code==200 and len(res.json())==2
    assert res.json()[0]['probabilities']==upload(client,image('yellow')).json()['probabilities']
    assert res.json()[1]['probabilities']==upload(client,image('black')).json()['probabilities']
    bad=files+[('files',('bad.png',b'bad','image/png'))]
    res=client.post('/predict/batch',files=bad)
    assert res.status_code==400 and 'Imagen 3' in res.json()['detail']
    monkeypatch.setattr(settings,'MAX_BATCH_FILES',1)
    assert client.post('/predict/batch',files=files).status_code==400

def test_batch_total_limit(client,monkeypatch):
    monkeypatch.setattr(settings,'MAX_BATCH_SIZE_MB',1)
    raw=image()+b'\0'*(600*1024)
    assert client.post('/predict/batch',files=[('files',('a.png',raw,'image/png')),('files',('b.png',raw,'image/png'))]).status_code==413

def test_cors(client):
    headers={'Origin':'http://localhost:5500','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}
    assert client.options('/predict',headers=headers).headers['access-control-allow-origin']=='http://localhost:5500'
    headers['Origin']='https://untrusted.invalid'
    assert client.options('/predict',headers=headers).status_code==400

def test_model_unavailable(client):
    previous=app.state.loader
    try:
        app.state.loader=None
        assert client.get('/health').status_code==503
        assert client.get('/model/info').status_code==503
        assert upload(client).status_code==503
    finally:app.state.loader=previous
