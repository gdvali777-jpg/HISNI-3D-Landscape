import json, re, sys
def load(path):
    s=open(path,encoding='utf-8').read()
    m=re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', s, re.S)
    return json.loads(m.group(1))
def hydrate(arr):
    cache={}
    sys.setrecursionlimit(100000)
    def h(i):
        if i in cache: return cache[i]
        v=arr[i]
        if isinstance(v,list):
            if v and isinstance(v[0],str) and v[0] in ('Reactive','ShallowReactive','Ref','ShallowRef','EmptyRef','EmptyShallowRef','NuxtError'):
                r=h(v[1]) if len(v)>1 else None; cache[i]=r; return r
            if v and isinstance(v[0],str) and v[0] in ('Date',): cache[i]=v[1]; return v[1]
            if v and isinstance(v[0],str) and v[0] in ('Set',): r=[h(x) for x in v[1:]]; cache[i]=r; return r
            if v and isinstance(v[0],str) and v[0] in ('Map',): r={}; cache[i]=r; it=v[1:]; [r.__setitem__(str(h(it[k])),h(it[k+1])) for k in range(0,len(it),2)]; return r
            r=[]; cache[i]=r; r.extend(h(x) for x in v); return r
        if isinstance(v,dict):
            r={}; cache[i]=r
            for k,x in v.items(): r[k]=h(x) if isinstance(x,int) and not isinstance(x,bool) else x
            return r
        cache[i]=v; return v
    return h(0)
