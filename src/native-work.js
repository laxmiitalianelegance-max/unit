function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function clean(v,max=160){return String(v||'').trim().slice(0,max)}
function validId(v){return /^[A-Za-z0-9._:-]{1,160}$/.test(String(v||''))}
function store(env,uid){if(!env.NATIVE_STORE)throw new Error('NATIVE_STORE binding is not configured.');return env.NATIVE_STORE.get(env.NATIVE_STORE.idFromName(uid))}
async function callStore(env,uid,path,init={}){const r=await store(env,uid).fetch(new Request('https://native.internal/native-store'+path,{...init,headers:{'content-type':'application/json',...(init.headers||{})}}));const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={error:text||'Native store error.'}}return{r,data}}
const COLLECTION='__unit369_work_v1';
async function ensureCollection(env,uid){const list=await callStore(env,uid,'/data/collections');if(!list.r.ok)throw new Error(list.data.error||'Unable to list native data collections.');let c=(list.data.collections||[]).find(x=>x.name===COLLECTION);if(c)return c;const created=await callStore(env,uid,'/data/collections',{method:'POST',body:JSON.stringify({name:COLLECTION,schema:{type:'project|task',project_id:'string',status:'string',priority:'string',due_at:'string',description:'string'}})});if(!created.r.ok)throw new Error(created.data.error||'Unable to create work collection.');return created.data.collection}
async function records(env,uid,cid,q=''){const x=await callStore(env,uid,`/data/collections/${cid}/records${q?'?q='+encodeURIComponent(q):''}`);if(!x.r.ok)throw new Error(x.data.error||'Unable to read work records.');return x.data.records||[]}
function normalizeProject(r){const d=r.data||{};return{id:r.id,name:r.name||d.name||'',description:d.description||'',status:d.status||'active',created_at:r.created_at,updated_at:r.updated_at}}
function normalizeTask(r){const d=r.data||{};return{id:r.id,project_id:d.project_id,name:r.name||d.name||'',description:d.description||'',status:d.status||'todo',priority:d.priority||'normal',due_at:d.due_at||'',created_at:r.created_at,updated_at:r.updated_at}}
async function getRecord(env,uid,cid,rid){const x=await callStore(env,uid,`/data/collections/${cid}/records/${rid}`);return x.r.ok?x.data.record:null}
async function updateRecord(env,uid,cid,rid,name,data){return callStore(env,uid,`/data/collections/${cid}/records/${rid}`,{method:'PUT',body:JSON.stringify({name,record:data})})}
export async function handleNativeWork(request,env,account){
  const u=new URL(request.url),p=u.pathname.replace(/^\/api\/native\/projects\/?/,'').split('/').filter(Boolean),cid=(await ensureCollection(env,account.uid)).id;
  if(!p.length){
    if(request.method==='GET'){const all=await records(env,account.uid,cid);return json({projects:all.filter(r=>r.data?.type==='project').map(normalizeProject)})}
    if(request.method==='POST'){const b=await request.json(),name=clean(b.name);if(!name)return json({error:'Project name is required.'},400);const d={type:'project',name,description:clean(b.description,4000),status:clean(b.status||'active',40)};const x=await callStore(env,account.uid,`/data/collections/${cid}/records`,{method:'POST',body:JSON.stringify({name,record:d})});if(!x.r.ok)return json(x.data,x.r.status);return json({project:normalizeProject(x.data.record)},201)}
    return json({error:'Method not allowed.'},405)
  }
  const projectId=p[0];if(!validId(projectId))return json({error:'Invalid project id.'},400);const projectRecord=await getRecord(env,account.uid,cid,projectId);if(!projectRecord||projectRecord.data?.type!=='project')return json({error:'Project not found.'},404);
  if(p.length===1){
    if(request.method==='GET')return json({project:normalizeProject(projectRecord)});
    if(request.method==='PUT'){const b=await request.json(),old=projectRecord.data||{},name=clean(b.name||projectRecord.name),d={...old,type:'project',name,description:b.description===undefined?(old.description||''):clean(b.description,4000),status:clean(b.status||old.status||'active',40)};const x=await updateRecord(env,account.uid,cid,projectId,name,d);if(!x.r.ok)return json(x.data,x.r.status);return json({project:{id:projectId,name,description:d.description,status:d.status,updated_at:Date.now()}})}
    if(request.method==='DELETE'){const all=await records(env,account.uid,cid);for(const t of all.filter(r=>r.data?.type==='task'&&r.data?.project_id===projectId))await callStore(env,account.uid,`/data/collections/${cid}/records/${t.id}`,{method:'DELETE'});const x=await callStore(env,account.uid,`/data/collections/${cid}/records/${projectId}`,{method:'DELETE'});if(!x.r.ok)return json(x.data,x.r.status);return json({ok:true})}
    return json({error:'Method not allowed.'},405)
  }
  if(p[1]!=='tasks')return json({error:'Work route not found.'},404);
  if(p.length===2){
    if(request.method==='GET'){const all=await records(env,account.uid,cid);return json({tasks:all.filter(r=>r.data?.type==='task'&&r.data?.project_id===projectId).map(normalizeTask)})}
    if(request.method==='POST'){const b=await request.json(),name=clean(b.name);if(!name)return json({error:'Task name is required.'},400);const d={type:'task',project_id:projectId,name,description:clean(b.description,4000),status:clean(b.status||'todo',40),priority:clean(b.priority||'normal',40),due_at:clean(b.due_at||'',80)};const x=await callStore(env,account.uid,`/data/collections/${cid}/records`,{method:'POST',body:JSON.stringify({name,record:d})});if(!x.r.ok)return json(x.data,x.r.status);return json({task:normalizeTask(x.data.record)},201)}
    return json({error:'Method not allowed.'},405)
  }
  const taskId=p[2];if(!validId(taskId))return json({error:'Invalid task id.'},400);const taskRecord=await getRecord(env,account.uid,cid,taskId);if(!taskRecord||taskRecord.data?.type!=='task'||taskRecord.data?.project_id!==projectId)return json({error:'Task not found.'},404);
  if(request.method==='GET')return json({task:normalizeTask(taskRecord)});
  if(request.method==='PUT'){const b=await request.json(),old=taskRecord.data||{},name=clean(b.name||taskRecord.name),d={...old,type:'task',project_id:projectId,name,description:b.description===undefined?(old.description||''):clean(b.description,4000),status:clean(b.status||old.status||'todo',40),priority:clean(b.priority||old.priority||'normal',40),due_at:b.due_at===undefined?(old.due_at||''):clean(b.due_at,80)};const x=await updateRecord(env,account.uid,cid,taskId,name,d);if(!x.r.ok)return json(x.data,x.r.status);return json({task:{id:taskId,project_id:projectId,name,description:d.description,status:d.status,priority:d.priority,due_at:d.due_at,updated_at:Date.now()}})}
  if(request.method==='DELETE'){const x=await callStore(env,account.uid,`/data/collections/${cid}/records/${taskId}`,{method:'DELETE'});if(!x.r.ok)return json(x.data,x.r.status);return json({ok:true})}
  return json({error:'Method not allowed.'},405)
}
