"""Frieren Neural native decoder-only Transformer; all weights use random initialization."""
from dataclasses import asdict, dataclass
import torch
from torch import nn
from torch.nn import functional as F

@dataclass(frozen=True)
class FrierenNeuralConfig:
    vocab_size:int
    d_model:int=256
    n_layers:int=6
    n_heads:int=8
    n_kv_heads:int=4
    max_seq_len:int=256
    dropout:float=0.05
    def __post_init__(self):
        if self.vocab_size<260 or min(self.d_model,self.n_layers,self.n_heads,self.n_kv_heads,self.max_seq_len)<1: raise ValueError("Invalid model dimensions")
        if self.d_model%self.n_heads or self.n_heads%self.n_kv_heads or (self.d_model//self.n_heads)%2: raise ValueError("Incompatible attention dimensions")
        if not 0<=self.dropout<1: raise ValueError("Invalid dropout")
    @property
    def head_dim(self): return self.d_model//self.n_heads
    @property
    def intermediate_size(self): return ((int(8*self.d_model/3)+63)//64)*64
    def to_dict(self): return asdict(self)

class RMSNorm(nn.Module):
    def __init__(self,width):
        super().__init__(); self.weight=nn.Parameter(torch.ones(width)); self.eps=1e-6
    def forward(self,x): return x*torch.rsqrt(x.pow(2).mean(-1,keepdim=True)+self.eps)*self.weight

def rope(x,theta=10000.0):
    d=x.shape[-1]; freq=1/(theta**(torch.arange(0,d,2,device=x.device,dtype=torch.float32)/d))
    angle=torch.outer(torch.arange(x.shape[-2],device=x.device,dtype=torch.float32),freq)
    c=angle.cos().to(x.dtype)[None,None]; s=angle.sin().to(x.dtype)[None,None]
    pair=x.reshape(*x.shape[:-1],d//2,2); a,b=pair[...,0],pair[...,1]
    return torch.stack((a*c-b*s,a*s+b*c),-1).flatten(-2)

class Attention(nn.Module):
    def __init__(self,c):
        super().__init__(); self.c=c
        self.q=nn.Linear(c.d_model,c.n_heads*c.head_dim,bias=False); self.k=nn.Linear(c.d_model,c.n_kv_heads*c.head_dim,bias=False)
        self.v=nn.Linear(c.d_model,c.n_kv_heads*c.head_dim,bias=False); self.o=nn.Linear(c.d_model,c.d_model,bias=False)
    def forward(self,x):
        b,t,w=x.shape;c=self.c
        q=rope(self.q(x).view(b,t,c.n_heads,c.head_dim).transpose(1,2))
        k=rope(self.k(x).view(b,t,c.n_kv_heads,c.head_dim).transpose(1,2))
        v=self.v(x).view(b,t,c.n_kv_heads,c.head_dim).transpose(1,2)
        if c.n_kv_heads!=c.n_heads:
            n=c.n_heads//c.n_kv_heads;k=k.repeat_interleave(n,1);v=v.repeat_interleave(n,1)
        y=F.scaled_dot_product_attention(q,k,v,is_causal=True,dropout_p=c.dropout if self.training else 0)
        return self.o(y.transpose(1,2).contiguous().view(b,t,w))

class Block(nn.Module):
    def __init__(self,c):
        super().__init__();m=c.intermediate_size
        self.n1=RMSNorm(c.d_model);self.attn=Attention(c);self.n2=RMSNorm(c.d_model)
        self.gate=nn.Linear(c.d_model,m,bias=False);self.up=nn.Linear(c.d_model,m,bias=False);self.down=nn.Linear(m,c.d_model,bias=False)
    def forward(self,x): return x+self.attn(self.n1(x))+self.down(F.silu(self.gate(self.n2(x)))*self.up(self.n2(x)))

class FrierenNeuralModel(nn.Module):
    architecture_id="frieren-neural-transformer-v2"
    def __init__(self,c):
        super().__init__();self.config=c;self.emb=nn.Embedding(c.vocab_size,c.d_model)
        self.blocks=nn.ModuleList([Block(c) for _ in range(c.n_layers)]);self.norm=RMSNorm(c.d_model);self.head=nn.Linear(c.d_model,c.vocab_size,bias=False);self.head.weight=self.emb.weight
        self.apply(self._init)
    @staticmethod
    def _init(m):
        if isinstance(m,(nn.Linear,nn.Embedding)): nn.init.normal_(m.weight,0,.02)
    def forward(self,ids,targets=None):
        if ids.dtype!=torch.long or ids.ndim!=2 or not 1<=ids.shape[1]<=self.config.max_seq_len: raise ValueError("Invalid input ids/context")
        x=self.emb(ids)
        for block in self.blocks:x=block(x)
        logits=self.head(self.norm(x))
        if targets is None:return logits
        if targets.shape!=ids.shape or targets.dtype!=torch.long or not torch.any(targets!=-100): raise ValueError("Invalid supervised targets")
        return logits,F.cross_entropy(logits.reshape(-1,logits.size(-1)),targets.reshape(-1),ignore_index=-100)
