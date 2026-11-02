// MDPro4 1.0.6 / 64-bit IL2CPP. Reads only the native Test Hand recorder.
// No Interceptor, game-method invocation, field write, or input automation.
if (Process.pointerSize !== 8) throw new Error('Unsupported pointer size');
const ga=Process.getModuleByName('GameAssembly.dll');
const api=(n,r,a)=>new NativeFunction(ga.getExportByName('il2cpp_'+n),r,a);
const domain=api('domain_get','pointer',[])();
const thread=api('thread_attach','pointer',['pointer'])(domain);
const lifetime={};
Script.bindWeak(lifetime,()=>api('thread_detach','void',['pointer'])(thread));
const count=Memory.alloc(8);count.writeU64(0);const assemblies=api('domain_get_assemblies','pointer',['pointer','pointer'])(domain,count);
const img=api('assembly_get_image','pointer',['pointer']),imn=api('image_get_name','pointer',['pointer']),klass=api('class_from_name','pointer',['pointer','pointer','pointer']);
const field=api('class_get_field_from_name','pointer',['pointer','pointer']),offset=api('field_get_offset','int',['pointer']),objclass=api('object_get_class','pointer',['pointer']),staticget=api('field_static_get_value','void',['pointer','pointer']);
const length=api('string_length','int',['pointer']),chars=api('string_chars','pointer',['pointer']);
const cache=new Map();
let previous='',previousAt=0;
function report(value){const key=JSON.stringify(value),now=Date.now();if(key!==previous||now-previousAt>1500){previous=key;previousAt=now;send({...value,observedAt:now,pid:Process.id});}}
function at(o,n){if(o.isNull())return ptr(0);const k=objclass(o);const key=k+':'+n;let off=cache.get(key);if(off===undefined){const f=field(k,Memory.allocUtf8String(n));if(f.isNull())throw Error('Missing field '+n);off=offset(f);cache.set(key,off);}return o.add(off);}
function ref(o,n){return at(o,n).readPointer();}
function text(o){if(o.isNull())return '';const n=length(o);if(n<0||n>20000)throw Error('String limit');return chars(o).readUtf16String(n);}
function str(o,n){return text(ref(o,n));}
function list(o,convert,ints=false){if(o.isNull())return [];const version=at(o,'_version').readS32();const n=at(o,'_size').readS32();if(n<0||n>300)throw Error('List limit');const a=ref(o,'_items');if(a.isNull()&&n)throw Error('Null items');if(!a.isNull()&&a.add(24).readU64().toNumber()<n)throw Error('Array size changed');const arr=[];for(let i=0;i<n;i++)arr.push(ints?a.add(32+i*4).readS32():convert(a.add(32+i*8).readPointer()));if(at(o,'_version').readS32()!==version)throw Error('List changed');return arr;}
const ints=o=>list(o,null,true);
const flow=o=>({card:at(o,'card').readS32(),join:str(o,'join'),action:str(o,'action'),zone:str(o,'zone'),caption:str(o,'caption'),group:str(o,'group')});
const step=o=>({title:str(o,'title'),text:str(o,'text'),kind:str(o,'kind'),cards:ints(ref(o,'cards')),flow:list(ref(o,'flow'),flow)});
const guide=o=>({id:str(o,'id'),title:str(o,'title'),description:str(o,'description'),startingCards:ints(ref(o,'startingCards')),endCards:ints(ref(o,'endCards')),requiredCards:ints(ref(o,'requiredCards')),playsAround:ints(ref(o,'playsAround')),startFlow:list(ref(o,'startFlow'),flow),endFlow:list(ref(o,'endFlow'),flow),steps:list(ref(o,'steps'),step)});
let captureClass=ptr(0);for(let i=0;i<count.readU64().toNumber();i++){const image=img(assemblies.add(i*8).readPointer());if(imn(image).readUtf8String()==='Assembly-CSharp.dll'){captureClass=klass(image,Memory.allocUtf8String('MDPro4.Combo'),Memory.allocUtf8String('HandTestComboCapture'));break;}}
if(captureClass.isNull())throw Error('Test Hand recorder unavailable in this build');
const recordingField=field(captureClass,Memory.allocUtf8String('recording'));
const versionField=field(captureClass,Memory.allocUtf8String('connectionVersion'));
if(recordingField.isNull())throw Error('Recorder layout unsupported');
function snapshot(){try{const output=Memory.alloc(8);staticget(recordingField,output);const recording=output.readPointer();if(recording.isNull()){report({event:'live-snapshot',active:false});return;}
const sheet=ref(recording,'<Sheet>k__BackingField');const tabs=list(ref(sheet,'tabs'),o=>({id:str(o,'id'),title:str(o,'title'),combos:list(ref(o,'combos'),guide)}));
const result={schemaVersion:1,id:str(sheet,'id'),title:str(sheet,'title'),description:str(sheet,'description'),author:str(sheet,'author'),accent:str(sheet,'accent'),tags:[],tabs};
if(result.tabs.length&&result.tabs[0].combos.length){result.tabs[0].combos[0].startingCards=ints(ref(recording,'opening'));result.tabs[0].combos[0].steps=list(ref(recording,'steps'),step);}
const versionValue=Memory.alloc(4);staticget(versionField,versionValue);
report({event:'live-snapshot',active:true,sessionId:Process.id+':'+recording.toString()+':'+versionValue.readS32(),limited:at(recording,'<Limited>k__BackingField').readU8()!==0,sheet:result});}catch(e){report({event:'observer-error',active:false,limited:true,error:String(e)});}}
snapshot();
const timer=setInterval(snapshot,250);
Script.bindWeak(lifetime,()=>clearInterval(timer));
