import { resolveAccount } from './accounts.js';
import { handleNativeWork } from './native-work.js';

export const NATIVE_CAPABILITIES = Object.freeze({
  intelligence:{name:'Intelligence',version:1,operations:['chat','research','plan','critique','verify','knowledge.search'],native:true},
  create:{name:'Create',version:1,operations:['document.create','document.read','document.list','document.update','document.delete','content.generate','asset.describe'],native:true},
  build:{name:'Build',version:1,operations:['project.create','file.write','file.read','diff.create','test.plan'],native:true},
  work:{name:'Work',version:2,operations:['project.create','project.read','project.list','project.update','project.delete','task.create','task.read','task.list','task.update','task.delete','milestone.manage'],native:true},
  data:{name:'Data',version:1,operations:['collection.create','record.create','record.update','record.query','search'],native:true},
  automate:{name:'Automate',version:1,operations:['workflow.create','workflow.run','schedule.define','approval.request'],native:true},
  business:{name:'Business',version:1,operations:['contact.manage','lead.manage','product.manage','order.manage','report.create'],native:true},
  communicate:{name:'Communicate',version:1,operations:['message.compose','thread.manage','notification.create'],native:true},
  files:{name:'Files',version:1,operations:['file.store','file.read','file.list','file.delete','file.search'],native:true},
  orchestrate:{name:'Orchestrate',version:1,operations:['intent.plan','capability.execute','result.verify','audit.read'],native:true}
});

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
export function capabilityList(){return Object.entries(NATIVE_CAPABILITIES).map(([id,c])=>({id,...c}))}
export function hasOperation(capability,operation){const c=NATIVE_CAPABILITIES[capability];return !!c&&c.operations.includes(operation)}
export function planNativeIntent(text){
  const q=String(text||'').toLowerCase(),steps=[];
  const add=(capability,operation,reason)=>{if(hasOperation(capability,operation)&&!steps.some(s=>s.capability===capability&&s.operation===operation))steps.push({capability,operation,reason})};
  if(/document|doc|note|report|write|tekst|dokument|izveštaj|izvjestaj/.test(q))add('create','document.create','Create a native Unit369 document');
  if(/knowledge|search|find|remember|znanje|pretraž|pretraz|nađi|nadji/.test(q))add('intelligence','knowledge.search','Search native Unit369 knowledge');
  if(/code|app|website|site|build|program|kod|aplikacij|sajt/.test(q))add('build','project.create','Create or modify a native Unit369 build project');
  if(/project|projekat|projekt/.test(q))add('work','project.create','Create or manage a native Unit369 project');
  if(/task|milestone|plan|zadat/.test(q))add('work','task.create','Track work natively in Unit369');
  if(/data|table|database|record|podac|tabel|baza/.test(q))add('data','collection.create','Use native Unit369 structured data');
  if(/automat|workflow|schedule|trigger|raspored/.test(q))add('automate','workflow.create','Build a native Unit369 workflow');
  if(/customer|crm|lead|product|order|business|kupac|proizvod|porud/.test(q))add('business','product.manage','Use native Unit369 business capabilities');
  if(/message|notify|comment|poruk|obavest|obavijest/.test(q))add('communicate','message.compose','Use native Unit369 communication');
  if(/file|folder|upload|storage|fajl|datotek/.test(q))add('files','file.store','Use native Unit369 file storage');
  if(!steps.length)add('intelligence','plan','Use Unit369 intelligence to decompose the request');
  return{engine:'unit369-native',external_required:false,steps};
}

function store(env,uid){if(!env.NATIVE_STORE)throw new Error('NATIVE_STORE binding is not configured.');return env.NATIVE_STORE.get(env.NATIVE_STORE.idFromName(uid))}
async function proxyNative(request,env,account,url){
  const match=url.pathname.match(/^\/api\/native\/(files|data|documents|knowledge)(.*)$/);
  if(!match)return json({error:'Native capability route not found.'},404);
  const target='https://native.internal/native-store/'+match[1]+match[2]+url.search;
  return store(env,account.uid).fetch(new Request(target,request));
}

export async function handleNativeCapabilities(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/native/'))return null;
  const account=await resolveAccount(request,env);
  if(!account)return json({error:'Authentication required.'},401);
  try{
    if(url.pathname==='/api/native/capabilities'&&request.method==='GET')return json({native:true,capabilities:capabilityList()});
    if(url.pathname==='/api/native/plan'&&request.method==='POST'){
      let body={};
      try{body=await request.json()}catch{}
      return json({user_id:account.uid,...planNativeIntent(body.message)});
    }
    if(/^\/api\/native\/projects(\/|$)/.test(url.pathname))return handleNativeWork(request,env,account);
    if(/^\/api\/native\/(files|data|documents|knowledge)(\/|$)/.test(url.pathname))return proxyNative(request,env,account,url);
    return json({error:'Native capability route not found.'},404);
  }catch(e){
    return json({error:String(e.message||e)},500);
  }
}
