import APP_HTML from "./app.html";

const APP_VERSION = "2026.08.23.1";
const LOGO_ORIGINAL = "https://cdn.shopify.com/s/files/1/1026/5047/8921/files/unit369-exact-logo.jpg?v=1787373410";

const UI_BASE = {
  chat:"Chat", products:"Products", settings:"Settings", newChat:"New chat", workspace:"Workspace",
  aiMode:"AI mode", providers:"Providers", chatHistory:"Chat history", sideBySide:"Side by side",
  combinedAnswer:"Combined answer", crossCritique:"Cross-critique", howHelp:"How can I help?",
  messageUnit369:"Message Unit369", send:"Send", copy:"Copy", thinking:"Thinking…", aiTeamDetails:"AI Team details",
  integrations:"Integrations", refresh:"Refresh", connected:"Connected", notConnected:"Not connected",
  application:"Application", applicationLanguage:"Application language", automatic:"Automatic", custom:"Custom",
  compactInterface:"Compact interface", aiModels:"AI models", serverDefault:"Server default", version:"Version",
  name:"Name", price:"Price", sizes:"Sizes", description:"Description", status:"Status", draft:"Draft", active:"Active",
  sku:"SKU", type:"Type", vendor:"Vendor", tags:"Tags", images:"Images", video:"Video", reviewProduct:"Review product",
  confirmSave:"Confirm & save", edit:"Edit", saving:"Saving…", productSaved:"Product saved.", finalPreview:"Final preview",
  productIntro:"Create and review products before saving.", settingsIntro:"Application, language and integration settings.",
  aiPrepareDraft:"AI prepare draft", preparing:"Preparing…", aiDraftPrepared:"AI draft prepared. Review every field before saving.",
  addProductFirst:"Add a product name or rough notes first.", requiredFields:"Name, valid price and at least one size are required.",
  publishImmediately:"This product will be published immediately. Continue?", noHistory:"No conversations yet.",
  noAnswer:"No answer available.", retry:"Try again", offline:"Offline — server actions are unavailable until connection returns.",
  resetPreferences:"Reset local preferences", modelsNote:"Optional model overrides. Leave blank to use server defaults.",
  languageName:"Language name / BCP-47", productList:"Recent products", loadProducts:"Load products", emptyProducts:"No products found."
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...extra } });
}
function safeError(error){ return String(error?.message || error || "Unknown error").slice(0,700); }
function cleanJson(text){
  let t=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  const a=t.indexOf("{"), z=t.lastIndexOf("}");
  if(a>=0&&z>a)t=t.slice(a,z+1);
  return JSON.parse(t);
}
function manifest(){
  return { id:"/", name:"Unit369", short_name:"Unit369", description:"AI workspace and product management.", start_url:"/", scope:"/", display:"standalone", background_color:"#05070c", theme_color:"#05070c", orientation:"portrait-primary", icons:[
    {src:"/app-icon-192.jpg?v="+APP_VERSION,sizes:"192x192",type:"image/jpeg",purpose:"any maskable"},
    {src:"/app-icon-512.jpg?v="+APP_VERSION,sizes:"512x512",type:"image/jpeg",purpose:"any maskable"}
  ]};
}
function serviceWorker(){
  return `const CACHE='unit369-${APP_VERSION}';\nconst CORE=['/manifest.json','/app-icon-192.jpg','/app-icon-512.jpg'];\nself.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)))});\nself.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})()));\nself.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;e.respondWith((async()=>{try{return await fetch(e.request,{cache:'no-store'})}catch{return (await caches.match(e.request))||Response.error()}})())});`;
}
async function proxyLogo(size){
  const url=size===192?"https://cdn.shopify.com/s/files/1/1026/5047/8921/files/unit369-192-exact_3bed4afa-03b4-411c-9458-d14bbf667a60.jpg?v=1787374342":size===512?"https://cdn.shopify.com/s/files/1/1026/5047/8921/files/unit369-512-exact_6038ed5d-ecf6-4a2d-add1-25e26fb0642c.jpg?v=1787374350":LOGO_ORIGINAL;
  let upstream=await fetch(url);
  if(!upstream.ok)upstream=await fetch(LOGO_ORIGINAL);
  if(!upstream.ok)return new Response("",{status:404});
  return new Response(upstream.body,{headers:{"content-type":"image/jpeg","cache-control":"public,max-age=31536000,immutable"}});
}
function providerKey(env,p){ if(p==="openai")return env.OPENAI_API_KEY;if(p==="grok")return env.GROK_API_KEY||env.XAI_API_KEY;if(p==="claude")return env.ANTHROPIC_API_KEY;return null; }
async function aiProxy(request,env){
  try{
    const incoming=await request.json(); const provider=String(incoming.provider||request.headers.get("x-provider")||"openai").toLowerCase(); const key=providerKey(env,provider);
    if(!key)return json({error:`${provider.toUpperCase()} server key is not configured.`},503);
    const messages=Array.isArray(incoming.messages)?incoming.messages:[]; const max_tokens=Math.min(Math.max(Number(incoming.max_tokens)||1400,64),3000);
    if(provider==="claude"){
      const system=messages.filter(m=>m.role==="system").map(m=>String(m.content||"")).join("\n\n");
      const userMessages=messages.filter(m=>m.role!=="system").map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"")}));
      const upstream=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":String(key).trim(),"anthropic-version":"2023-06-01"},body:JSON.stringify({model:incoming.model||env.ANTHROPIC_MODEL||"claude-sonnet-4-6",max_tokens,system,messages:userMessages})});
      const data=await upstream.json(); if(!upstream.ok)return json({error:data?.error?.message||"Claude request failed."},upstream.status);
      return json({provider,model:data.model,content:(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n").trim()});
    }
    const endpoint=provider==="grok"?"https://api.x.ai/v1/chat/completions":"https://api.openai.com/v1/chat/completions";
    const model=incoming.model||(provider==="grok"?(env.GROK_MODEL||"grok-4"):(env.OPENAI_MODEL||"gpt-5.2"));
    const upstream=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${String(key).trim()}`},body:JSON.stringify({model,messages,max_tokens})});
    const data=await upstream.json(); if(!upstream.ok)return json({error:data?.error?.message||`${provider} request failed.`},upstream.status);
    return json({provider,model:data.model,content:data.choices?.[0]?.message?.content?.trim()||""});
  }catch(e){return json({error:safeError(e)},500)}
}
async function freeAi(request,env){
  try{ if(!env.AI)return json({error:"Workers AI is unavailable."},503); const incoming=await request.json(); const messages=Array.isArray(incoming.messages)?incoming.messages:[]; const result=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages,max_tokens:1500}); return json({provider:"workers-ai",model:"llama-3.3-70b",content:String(result?.response||"").trim()}); }catch(e){return json({error:safeError(e)},500)}
}
async function translateUi(request,env){
  try{
    const b=await request.json(); const target=String(b.target||"en").trim(); if(!target||target.toLowerCase().startsWith("en"))return json({d:UI_BASE}); if(!env.AI)return json({d:UI_BASE});
    const prompt=`Translate every JSON value naturally into ${target} for a modern software application. Return ONLY valid JSON with exactly the same keys. Keep Unit369, Claude, ChatGPT, OpenAI, Grok, Workers AI, Shopify, API, AI, SKU and BCP-47 unchanged. Use the standard regional form of the selected language. For Serbian use natural standard Serbian, preferably Ekavian, and avoid Croatian-specific words such as Bok, tisuća, računalo and siječanj. JSON: ${JSON.stringify(UI_BASE)}`;
    const r=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:"Return only valid JSON. Preserve every key exactly."},{role:"user",content:prompt}],max_tokens:3000});
    return json({d:{...UI_BASE,...cleanJson(r?.response)}});
  }catch(e){return json({d:UI_BASE,error:safeError(e)})}
}
async function synthesize(request,env){
  try{
    if(!env.AI)return json({error:"Workers AI is unavailable."},503); const b=await request.json(); const question=String(b.question||"").trim(); const answers=b.answers&&typeof b.answers==="object"?b.answers:{}; const mode=String(b.mode||"combine"); const language=String(b.language||"en"); const usable=Object.entries(answers).filter(([,v])=>typeof v==="string"&&v.trim());
    if(!question||usable.length<2)return json({error:"At least two answers are required."},400);
    const instruction=mode==="critique"?"Critically compare the answers, identify disagreements and weaknesses, then give one best final answer.":"Combine the strongest parts of the answers into one direct final answer without mentioning the models.";
    const result=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:`You are Unit369. ${instruction} Reply naturally in ${language}.`},{role:"user",content:`Question:\n${question}\n\nAnswers:\n${usable.map(([k,v])=>`[${k}]\n${v}`).join("\n\n")}`}],max_tokens:1800});
    return json({content:String(result?.response||"").trim()});
  }catch(e){return json({error:safeError(e)},500)}
}
async function prepareProduct(request,env){
  try{
    if(!env.AI)return json({error:"Workers AI is unavailable."},503); const b=await request.json(); const title=String(b.title||"").trim(),notes=String(b.notes||"").trim(),language=String(b.language||"en"); if(!title&&!notes)return json({error:"Provide a product name or notes."},400);
    const prompt=`Return ONLY valid JSON with keys title, description, productType, tags, suggestedSizes, skuBase. tags and suggestedSizes must be arrays. Never invent material, origin, dimensions, certifications, stock or claims not supplied. Write in ${language}. Raw title: ${title}. Raw notes: ${notes}`;
    const r=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:"You are the Unit369 ecommerce product assistant. Return only valid JSON and never fabricate facts."},{role:"user",content:prompt}],max_tokens:1400}); const o=cleanJson(r?.response);
    return json({draft:{title:String(o.title||title),description:String(o.description||""),productType:String(o.productType||""),tags:Array.isArray(o.tags)?o.tags.map(String).slice(0,12):[],suggestedSizes:Array.isArray(o.suggestedSizes)?o.suggestedSizes.map(String).slice(0,20):[],skuBase:String(o.skuBase||"")}});
  }catch(e){return json({error:safeError(e)},500)}
}
async function getShopifyToken(env){
  if(!env.SHOPIFY_SHOP||!env.SHOPIFY_CLIENT_ID||!env.SHOPIFY_CLIENT_SECRET)throw new Error("Shopify integration is not fully configured.");
  const res=await fetch(`https://${env.SHOPIFY_SHOP}/admin/oauth/access_token`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_id:env.SHOPIFY_CLIENT_ID,client_secret:env.SHOPIFY_CLIENT_SECRET,grant_type:"client_credentials"})}); const d=await res.json(); if(!res.ok||!d.access_token)throw new Error("Shopify authentication failed."); return d.access_token;
}
async function shopifyGraphQL(env,token,query,variables={}){ const res=await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/2025-10/graphql.json`,{method:"POST",headers:{"content-type":"application/json","x-shopify-access-token":token},body:JSON.stringify({query,variables})}); const p=await res.json(); if(!res.ok||p.errors?.length)throw new Error(p.errors?.[0]?.message||"Shopify GraphQL error."); return p.data; }
async function stagedUpload(env,token,file,resource){ const mimeType=file.type||(resource==="VIDEO"?"video/mp4":"image/jpeg"),filename=String(file.name||`${resource.toLowerCase()}-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g,"_"); const d=await shopifyGraphQL(env,token,`mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}`,{input:[{filename,mimeType,resource,httpMethod:"POST",fileSize:String(file.size)}]}); const result=d.stagedUploadsCreate;if(result.userErrors?.length)throw new Error(result.userErrors[0].message);const target=result.stagedTargets?.[0];if(!target)throw new Error("Shopify did not return an upload target.");const form=new FormData();target.parameters.forEach(p=>form.append(p.name,p.value));form.append("file",file,filename);const up=await fetch(target.url,{method:"POST",body:form});if(!up.ok)throw new Error(`Upload failed (${up.status}).`);return target.resourceUrl; }
async function listProducts(env){ try{const token=await getShopifyToken(env);const d=await shopifyGraphQL(env,token,`query{products(first:30,sortKey:UPDATED_AT,reverse:true){nodes{id title handle status productType vendor updatedAt featuredMedia{preview{image{url}}} variants(first:20){nodes{id title price sku inventoryQuantity}}}}}`);return json({products:d.products?.nodes||[]})}catch(e){return json({error:safeError(e)},500)} }
async function createProduct(request,env){
  try{
    const form=await request.formData(),title=String(form.get("title")||"").trim(),description=String(form.get("description")||"").trim(),price=Number(String(form.get("price")||"").replace(",",".")),sizes=String(form.get("sizes")||"").split(",").map(v=>v.trim()).filter(Boolean),status=String(form.get("status")||"DRAFT").toUpperCase()==="ACTIVE"?"ACTIVE":"DRAFT",productType=String(form.get("productType")||"").trim(),vendor=String(form.get("vendor")||"").trim(),skuBase=String(form.get("sku")||"").trim(),tags=String(form.get("tags")||"").split(",").map(v=>v.trim()).filter(Boolean);
    if(!title)return json({error:"Product name is required."},400);if(!Number.isFinite(price)||price<=0)return json({error:"Price must be greater than zero."},400);if(!sizes.length)return json({error:"Enter at least one size."},400);
    const token=await getShopifyToken(env);const created=await shopifyGraphQL(env,token,`mutation($product:ProductCreateInput!){productCreate(product:$product){product{id title handle variants(first:50){nodes{id title}}} userErrors{field message}}}`,{product:{title,descriptionHtml:description?`<p>${description.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</p>`:"",status,productType:productType||undefined,vendor:vendor||undefined,tags,productOptions:[{name:"Size",values:sizes.map(name=>({name}))}]}});if(created.productCreate.userErrors?.length)throw new Error(created.productCreate.userErrors[0].message);const product=created.productCreate.product,variants=product.variants?.nodes||[];
    if(variants.length){const variantsInput=variants.map((v,i)=>({id:v.id,price:price.toFixed(2),sku:skuBase?`${skuBase}-${sizes[i]||i+1}`:undefined}));const updated=await shopifyGraphQL(env,token,`mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{message}}}`,{productId:product.id,variants:variantsInput});if(updated.productVariantsBulkUpdate.userErrors?.length)throw new Error(updated.productVariantsBulkUpdate.userErrors[0].message)}
    const media=[];for(const file of form.getAll("images")){if(file&&typeof file!=="string"&&file.size)media.push({originalSource:await stagedUpload(env,token,file,"IMAGE"),mediaContentType:"IMAGE",alt:title})}const video=form.get("video");if(video&&typeof video!=="string"&&video.size)media.push({originalSource:await stagedUpload(env,token,video,"VIDEO"),mediaContentType:"VIDEO",alt:title});if(media.length){const attached=await shopifyGraphQL(env,token,`mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){mediaUserErrors{message}}}`,{productId:product.id,media});if(attached.productCreateMedia.mediaUserErrors?.length)throw new Error(attached.productCreateMedia.mediaUserErrors[0].message)}
    const numericId=String(product.id).split("/").pop(),shopHandle=String(env.SHOPIFY_SHOP).split(".")[0];return json({ok:true,product:{id:product.id,title:product.title,handle:product.handle,status},adminUrl:`https://admin.shopify.com/store/${shopHandle}/products/${numericId}`});
  }catch(e){return json({error:safeError(e)},500)}
}
function integrationStatus(env){return{version:APP_VERSION,integrations:{claude:!!env.ANTHROPIC_API_KEY,openai:!!env.OPENAI_API_KEY,grok:!!(env.GROK_API_KEY||env.XAI_API_KEY),workersAi:!!env.AI,shopify:!!(env.SHOPIFY_SHOP&&env.SHOPIFY_CLIENT_ID&&env.SHOPIFY_CLIENT_SECRET)}}}
function serveApp(){return new Response(APP_HTML,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store, no-cache, must-revalidate","pragma":"no-cache","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin"}})}

export default { async fetch(request,env){
  const url=new URL(request.url);
  if((url.pathname==="/"||url.pathname==="/app")&&request.method==="GET")return serveApp();
  if(url.pathname==="/api/status"&&request.method==="GET")return json(integrationStatus(env));
  if(url.pathname==="/api/ai-proxy"&&request.method==="POST")return aiProxy(request,env);
  if(url.pathname==="/api/free-ai"&&request.method==="POST")return freeAi(request,env);
  if(url.pathname==="/api/ui-i18n"&&request.method==="POST")return translateUi(request,env);
  if(url.pathname==="/api/team-synthesize"&&request.method==="POST")return synthesize(request,env);
  if(url.pathname==="/api/product-prepare"&&request.method==="POST")return prepareProduct(request,env);
  if(url.pathname==="/api/products"&&request.method==="GET")return listProducts(env);
  if(url.pathname==="/api/create-product"&&request.method==="POST")return createProduct(request,env);
  if(url.pathname==="/manifest.json")return new Response(JSON.stringify(manifest()),{headers:{"content-type":"application/manifest+json; charset=utf-8","cache-control":"no-store"}});
  if(url.pathname==="/sw.js")return new Response(serviceWorker(),{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","service-worker-allowed":"/"}});
  if(url.pathname==="/app-icon-192.jpg")return proxyLogo(192);
  if(url.pathname==="/app-icon-512.jpg")return proxyLogo(512);
  return new Response("Not Found",{status:404});
}};