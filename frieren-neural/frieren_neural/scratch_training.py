"""Reproducible CPU training for Frieren Neural's own randomly initialized model."""
import argparse,hashlib,json,math,os,random
from pathlib import Path
import torch
from .scratch_model import FrierenNeuralConfig,FrierenNeuralModel
from .tokenizer import BPETokenizer
from .training import load_licensed_corpus,encode_dialogue_stream_with_loss_mask,_sample_batch
def run(data_dirs,checkpoint,steps=6000,seed=20261106,device="cpu"):
 torch.set_num_threads(2);random.seed(seed);torch.manual_seed(seed)
 docs=[];licenses=[];manifests=[]
 for folder in data_dirs:
  root=Path(folder);docs.extend(load_licensed_corpus(root));raw=(root/"corpus_manifest.json").read_bytes();manifests.append(hashlib.sha256(raw).hexdigest())
  licenses += [x["license"] for x in json.loads(raw)["documents"]]
 text="\n\n---\n\n".join(docs);split=int(len(text)*.9);train_text=text[:split];val_text=text[split:]
 tok=BPETokenizer.train([train_text],vocab_size=1024,min_frequency=2)
 def encode(s):
  ids,mask=encode_dialogue_stream_with_loss_mask(s,tok);return torch.tensor(ids),torch.tensor(mask,dtype=torch.bool)
 train,tm=encode(train_text);val,vm=encode(val_text)
 c=FrierenNeuralConfig(vocab_size=tok.vocab_size,d_model=256,n_layers=6,n_heads=8,n_kv_heads=4,max_seq_len=256)
 model=FrierenNeuralModel(c).to(device);opt=torch.optim.AdamW(model.parameters(),lr=2e-4,weight_decay=.1);g=torch.Generator().manual_seed(seed+1)
 for step in range(1,steps+1):
  x,y=_sample_batch(train,batch_size=4,block_size=256,device=torch.device(device),generator=g,target_mask=tm)
  _,loss=model(x,y);opt.zero_grad(set_to_none=True);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.0);opt.step()
  if step==1 or step%250==0 or step==steps:
   model.eval()
   with torch.no_grad():
    xx,yy=_sample_batch(val,batch_size=4,block_size=256,device=torch.device(device),generator=g,target_mask=vm);_,vl=model(xx,yy)
   model.train()
   print(json.dumps({"step":step,"total_steps":steps,"train_loss":float(loss),"validation_loss":float(vl)},ensure_ascii=False),flush=True)
   payload={"format_version":2,"architecture_id":model.architecture_id,"pretrained_weights":False,"model_config":c.to_dict(),"model_state":model.state_dict(),"tokenizer":tok.to_dict(),"step":step,"seed":seed,"training_corpus_sha256":hashlib.sha256(train_text.encode()).hexdigest(),"manifest_sha256":hashlib.sha256("".join(manifests).encode()).hexdigest(),"licenses":sorted(set(licenses)),"training_config":{"steps":steps,"d_model":256,"n_layers":6,"n_heads":8,"n_kv_heads":4,"context":256}}
   Path(checkpoint).parent.mkdir(parents=True,exist_ok=True);torch.save(payload,checkpoint)
 return {"step":steps,"architecture_id":model.architecture_id,"pretrained_weights":False}
def main():
 p=argparse.ArgumentParser();p.add_argument("--data",action="append",required=True);p.add_argument("--checkpoint",required=True);p.add_argument("--steps",type=int,default=6000);p.add_argument("--seed",type=int,default=20261106);p.add_argument("--device",default="cpu");a=p.parse_args();print(json.dumps(run(a.data,a.checkpoint,a.steps,a.seed,a.device),indent=2))
if __name__=="__main__":main()
