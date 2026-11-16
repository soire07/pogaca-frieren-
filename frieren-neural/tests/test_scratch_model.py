import torch,pytest
from torch import nn
from frieren_neural.scratch_model import Block,FrierenNeuralConfig,FrierenNeuralModel
from frieren_neural.scratch_training import split_native_corpus
def test_native_transformer_forward_and_assistant_loss():
 c=FrierenNeuralConfig(vocab_size=280,d_model=32,n_layers=2,n_heads=4,n_kv_heads=2,max_seq_len=16,dropout=0)
 m=FrierenNeuralModel(c);x=torch.randint(0,280,(2,7));y=x.clone();y[:,:2]=-100
 logits,loss=m(x,y);assert logits.shape==(2,7,280) and torch.isfinite(loss)
def test_native_transformer_is_causal():
 torch.manual_seed(4);m=FrierenNeuralModel(FrierenNeuralConfig(vocab_size=280,d_model=32,n_layers=1,n_heads=4,n_kv_heads=2,max_seq_len=16,dropout=0)).eval()
 a=m(torch.tensor([[1,2,3,4]]));b=m(torch.tensor([[1,2,9,8]]));assert torch.allclose(a[:,:2],b[:,:2],atol=1e-5)
def test_native_transformer_rejects_invalid_supervision():
 m=FrierenNeuralModel(FrierenNeuralConfig(vocab_size=280,d_model=32,n_layers=1,n_heads=4,n_kv_heads=2,max_seq_len=16))
 x=torch.ones((1,4),dtype=torch.long)
 with pytest.raises(ValueError):m(x,torch.full_like(x,-100))

def test_feed_forward_uses_attention_updated_hidden_state():
 c=FrierenNeuralConfig(vocab_size=280,d_model=32,n_layers=1,n_heads=4,n_kv_heads=2,max_seq_len=16,dropout=0)
 class Capture(nn.Module):
  def __init__(self): super().__init__();self.seen=None
  def forward(self,x): self.seen=x.detach().clone();return x
 class Ones(nn.Module):
  def forward(self,x): return torch.ones_like(x)
 block=Block(c);capture=Capture()
 block.n1=nn.Identity();block.attn=Ones();block.n2=capture
 block.gate=nn.Identity();block.up=nn.Identity();block.down=nn.Identity()
 output=block(torch.zeros((1,2,c.d_model)))
 assert torch.equal(capture.seen,torch.ones_like(capture.seen))
 assert torch.all(output>1.0)

def test_native_training_split_preserves_complete_dialogues():
 separator="\n\n---\n\n"
 conversations=[f"Kullanıcı: soru {i}\nAsistan: cevap {i}" for i in range(10)]
 train,validation=split_native_corpus([separator.join(conversations)],validation_fraction=0.2)
 train_units=train.split(separator);validation_units=validation.split(separator)
 assert train_units and validation_units
 assert set(train_units).isdisjoint(validation_units)
 assert set(train_units+validation_units)==set(conversations)
