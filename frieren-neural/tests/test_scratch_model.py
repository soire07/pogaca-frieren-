import torch,pytest
from frieren_neural.scratch_model import FrierenNeuralConfig,FrierenNeuralModel
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
