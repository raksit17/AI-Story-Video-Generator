<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storyApi, type CharacterProfile, type MossVoice, type ProjectSummary } from './services/story-api'

type Scene = { id:string; title:string; narration:string; imagePrompt:string; duration:number; image:string; imageUrl?:string; audioUrl?:string; voiceJob?:unknown; motion:string }
type Character = { id?:string; name:string; look:string; reference:string; referenceUrl?:string; voiceId?:string|null }
type Project = { storyId?:string; title:string; prompt:string; genre:string; language:string; ratio:string; scenes:Scene[]; character:Character; voice:string; metadata:{title:string; description:string; tags:string}; thumbnail:string }
const blank = ():Project => ({title:'เรื่องใหม่',prompt:'',genre:'Anime Fantasy',language:'ไทย',ratio:'9:16',scenes:[],character:{name:'',look:'',reference:''},voice:'',metadata:{title:'',description:'',tags:''},thumbnail:''})
const saved = localStorage.getItem('storyframe-project-v1')
const project = ref<Project>(saved ? JSON.parse(saved) : blank())
const activePhase=ref(1), selected=ref(0), busy=ref(false), toast=ref('')
const generatingSceneId=ref<string|null>(null)
const imageError=ref('')
const imageProgress=ref('')
const plannerError=ref(''), visualBusy=ref(false), visualError=ref('')
const imageSeconds=ref(0)
const projects=ref<ProjectSummary[]>([]), characterProfiles=ref<CharacterProfile[]>([]), mossVoices=ref<MossVoice[]>([])
const selectedProfileId=ref(''), selectedVoiceId=ref(''), savingProject=ref(false), savingCharacter=ref(false), applyingCharacter=ref(false), voiceBusy=ref(false)
const currentProjectId=computed(()=>project.value.storyId)
const current = computed(()=>project.value.scenes[selected.value])
watch(project, v=>localStorage.setItem('storyframe-project-v1',JSON.stringify(v)),{deep:true})
function notify(s:string){toast.value=s; setTimeout(()=>toast.value='',2600)}
function scene(title:string,narration:string,prompt:string,duration=7):Scene{return{id:crypto.randomUUID(),title,narration,imagePrompt:prompt,duration,image:'',motion:'ซูมเข้า'}}
function draftStory(){
 if(!project.value.prompt.trim()){notify('ใส่แนวคิดเรื่องก่อนเริ่มสร้าง');return}
 const seed=project.value.prompt.trim()
 project.value.storyId=undefined
 project.value.title=seed.length>34?seed.slice(0,34)+'…':seed
 project.value.scenes=[
  scene('จุดเริ่มต้น',`เรื่องเริ่มต้นขึ้นเมื่อ ${seed} ตัวเอกยังไม่รู้ว่าการตัดสินใจครั้งนี้จะเปลี่ยนทุกอย่าง`,`${project.value.genre}, establishing shot, main character introduced, cinematic composition`),
  scene('เงื่อนงำ',`ระหว่างทาง ตัวเอกพบสัญญาณลึกลับที่เชื่อมโยงกับอดีต`,`${project.value.genre}, mysterious discovery, expressive character, dramatic light`),
  scene('บททดสอบ',`อุปสรรคครั้งใหญ่บีบให้เธอต้องเลือกว่าจะยอมแพ้ หรือก้าวต่อไป`,`${project.value.genre}, emotional confrontation, dynamic framing, detailed background`),
  scene('พลังตื่นขึ้น',`เมื่อยอมรับตัวตนที่แท้จริง พลังใหม่ก็ปรากฏขึ้น`,`${project.value.genre}, magical transformation, glowing particles, cinematic anime`),
  scene('บทสรุป',`การเดินทางยังไม่จบ แต่ครั้งนี้เธอพร้อมกำหนดชะตาของตัวเอง`,`${project.value.genre}, hopeful finale, sunrise, heroic wide shot`)
 ]; selected.value=0; notify('สร้างโครงเรื่องตัวอย่างแล้ว — แก้ไขแต่ละฉากหรือเชื่อม AI เพื่อสร้างฉบับเต็ม')
}
function addScene(){project.value.scenes.push(scene('ฉากใหม่','','',7));selected.value=project.value.scenes.length-1}
function move(i:number,d:number){const j=i+d;if(j<0||j>=project.value.scenes.length)return;const a=project.value.scenes.splice(i,1)[0];project.value.scenes.splice(j,0,a);selected.value=j}
function fileData(e:Event, cb:(s:string)=>void){const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>cb(String(reader.result));reader.readAsDataURL(file)}
function addImage(e:Event){const target=current.value;if(target)fileData(e,s=>{target.image=s;target.imageUrl=undefined})}
function addCharacter(e:Event){fileData(e,s=>{project.value.character.reference=s;project.value.character.referenceUrl=undefined;notify('เลือกรูปแล้ว — กดบันทึกเพื่ออัปโหลดภาพอ้างอิง')})}
function addThumb(e:Event){fileData(e,s=>project.value.thumbnail=s)}
function exportProject(){const blob=new Blob([JSON.stringify(project.value,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='story-project.json';a.click();URL.revokeObjectURL(a.href)}
function importProject(e:Event){fileData(e,()=>{});const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;file.text().then(t=>{try{project.value=JSON.parse(t);selected.value=0;notify('นำเข้าโปรเจกต์แล้ว')}catch{notify('ไฟล์โปรเจกต์ไม่ถูกต้อง')}})}
async function generateStoryboard(){
 if(busy.value)return
 busy.value=true
 plannerError.value=''
 try{
  const result=await storyApi.generateStoryboard({
   prompt:project.value.prompt,genre:project.value.genre,
   language:project.value.language,aspect:project.value.ratio,
   character:{name:project.value.character.name,look:project.value.character.look},
   sceneCount:5,
  })
  if(!result.scenes?.length)throw new Error('AI ไม่ได้ส่งฉากกลับมา')
  project.value.storyId=undefined
  project.value.title=result.title||project.value.title
  project.value.scenes=result.scenes.map(s=>({
   id:s.id||crypto.randomUUID(),title:s.title,narration:s.narration,
   imagePrompt:s.imagePrompt,duration:s.duration||7,
   motion:s.motion||'ซูมเข้า',image:'',imageUrl:undefined,
  }))
  selected.value=0
  notify('AI สร้างบทบรรยายและภาพของทุกฉากสัมพันธ์กันแล้ว')
 }catch(error){
  plannerError.value=error instanceof Error?error.message:'ติดต่อ Story Planner ไม่สำเร็จ'
  notify('Story Planner มีปัญหา — ตรวจ Ollama หรือ API')
 }finally{busy.value=false}
}

async function syncVisualFromNarration(){
 const scene=current.value
 if(!scene||visualBusy.value)return
 if(scene.narration.trim().length<8){
  visualError.value='กรุณาเขียนบทบรรยายอย่างน้อย 8 ตัวอักษร'
  return
 }
 visualBusy.value=true
 visualError.value=''
 try{
  const result=await storyApi.generateSceneVisual({
   narration:scene.narration,title:scene.title,story:project.value.prompt,
   genre:project.value.genre,language:project.value.language,
   aspect:project.value.ratio,
   character:{name:project.value.character.name,look:project.value.character.look},
  })
  scene.imagePrompt=result.imagePrompt
  notify('อัปเดต Prompt ภาพจากบทบรรยายแล้ว — กดสร้างภาพ AI เพื่อใช้ Prompt ใหม่')
 }catch(error){
  visualError.value=error instanceof Error?error.message:'สร้าง Visual Prompt ไม่สำเร็จ'
 }finally{visualBusy.value=false}
}

function storyPayload(){
 const character=project.value.character
 return {title:project.value.title,prompt:project.value.prompt,genre:project.value.genre,language:project.value.language,aspect:project.value.ratio,
  character:{id:character.id,name:character.name,look:character.look,referenceUrl:character.referenceUrl,voiceId:character.voiceId},
  characters:character.name||character.look?[{id:character.id,name:character.name,description:character.look,appearance:character.look,referenceUrl:character.referenceUrl,voiceId:character.voiceId}]:[],
  scenes:project.value.scenes.map(s=>({id:s.id,title:s.title,narration:s.narration,imagePrompt:s.imagePrompt,duration:s.duration,motion:s.motion,imageUrl:s.imageUrl,audioUrl:s.audioUrl,subtitle:s.narration}))}
}
async function refreshProjects(){projects.value=await storyApi.listStories()}
async function saveProject(showNotice=true){
 if(savingProject.value)return
 savingProject.value=true
 try{project.value.storyId=await storyApi.saveStory(storyPayload(),project.value.storyId);await refreshProjects();if(showNotice)notify('บันทึกโปรเจกต์แล้ว');return true}
 catch(error){notify(error instanceof Error?error.message:'บันทึกโปรเจกต์ไม่สำเร็จ');return false}
 finally{savingProject.value=false}
}
async function loadProject(id:string){
 if(!id)return
 try{const saved=await storyApi.getStory(id);project.value={...blank(),...saved,storyId:id,ratio:String(saved.aspect||'9:16'),character:{...blank().character,...(saved.character||{}),look:String(saved.character?.look||saved.characters?.[0]?.description||''),reference:String(saved.character?.referenceUrl||saved.characters?.[0]?.referenceUrl||''),referenceUrl:saved.character?.referenceUrl||saved.characters?.[0]?.referenceUrl},scenes:(saved.scenes||[]).map((s:any)=>({...s,image:s.imageUrl||s.image||'',motion:s.motion||'ซูมเข้า'}))};selected.value=0;selectedProfileId.value=project.value.character.id||'';selectedVoiceId.value=project.value.character.voiceId||'';notify('เปิดโปรเจกต์แล้ว')}
 catch(error){notify(error instanceof Error?error.message:'เปิดโปรเจกต์ไม่สำเร็จ')}
}
function newProject(){project.value=blank();selected.value=0;selectedProfileId.value='';selectedVoiceId.value='';notify('เริ่มโปรเจกต์ใหม่แล้ว')}
async function refreshProfiles(){characterProfiles.value=await storyApi.listCharacterProfiles()}
async function persistCharacter(showNotice=true):Promise<boolean>{
 if(savingCharacter.value)return false
 const c=project.value.character
 if(!c.name.trim()||!c.look.trim()){notify('กรุณาใส่ชื่อและรูปลักษณ์ตัวละคร');return false}
 savingCharacter.value=true
 try{
  const profile=await storyApi.saveCharacterProfile({
   id:c.id,name:c.name,description:c.look,
   referenceData:c.reference.startsWith('data:')?c.reference:undefined,
   referenceUrl:c.referenceUrl,voiceId:c.voiceId||null,
  })
  c.id=profile.id;c.referenceUrl=profile.referenceUrl||undefined
  c.reference=profile.referenceUrl||''
  selectedProfileId.value=profile.id
  await refreshProfiles()
  if(showNotice)notify(c.referenceUrl?'บันทึกตัวละครและภาพอ้างอิงแล้ว':'บันทึกตัวละครแล้ว (ยังไม่มีภาพอ้างอิง)')
  return true
 }catch(error){
  notify(error instanceof Error?error.message:'บันทึกตัวละครไม่สำเร็จ')
  return false
 }finally{savingCharacter.value=false}
}
async function saveCharacter(){await persistCharacter()}
async function applyCharacterToScenes(){
 if(applyingCharacter.value)return
 applyingCharacter.value=true
 try{
  const c=project.value.character
  if(!c.reference&&!c.referenceUrl){notify('กรุณาเพิ่มภาพอ้างอิงก่อนใช้ตัวละครกับทุกฉาก');return}
  if(!await persistCharacter(false)||!c.referenceUrl)return
  const guide=`${c.name}: ${c.look}.`
  for(const scene of project.value.scenes){
   if(!scene.imagePrompt.includes(guide))scene.imagePrompt=`${guide} ${scene.imagePrompt}`
  }
  if(project.value.scenes.length){
   const saved=await saveProject(false)
   if(!saved){notify('บันทึก Story ไม่สำเร็จ โปรดลองอีกครั้ง');return}
  }
  notify('เชื่อมภาพอ้างอิงกับทุกฉากแล้ว — ComfyUI จะใช้ img2img')
 }finally{applyingCharacter.value=false}
}
function useCharacterProfile(id:string){
 selectedProfileId.value=id
 const profile=characterProfiles.value.find(p=>p.id===id)
 if(profile){project.value.character={id:profile.id,name:profile.name,look:profile.description,reference:profile.referenceUrl||'',referenceUrl:profile.referenceUrl||undefined,voiceId:profile.voiceId};selectedVoiceId.value=profile.voiceId||''}
}
async function generateNarration(){
 if(!project.value.scenes.length)return
 voiceBusy.value=true
 try{
  if(!await saveProject(false)||!project.value.storyId)throw new Error('บันทึกโปรเจกต์ก่อนสร้างเสียงไม่สำเร็จ')
  for(const item of project.value.scenes){
   if(!item.narration.trim())continue
   await storyApi.startSceneVoice(project.value.storyId!,item.id,selectedVoiceId.value||project.value.character.voiceId||undefined)
   for(let attempt=0;attempt<180;attempt++){
    const status=await storyApi.getSceneVoiceStatus(project.value.storyId!,item.id)
    if(status.status==='completed'&&status.url){item.audioUrl=status.url;break}
    if(status.status==='failed')throw new Error(status.error||'MOSS สร้างเสียงไม่สำเร็จ')
    await new Promise(resolve=>setTimeout(resolve,2000))
    if(attempt===179)throw new Error('หมดเวลารอ MOSS Voice Studio')
   }
  }
  await saveProject(false);notify('สร้างเสียงพากย์ด้วย MOSS สำเร็จ')
 }catch(error){notify(error instanceof Error?error.message:'สร้างเสียงไม่สำเร็จ')}
 finally{voiceBusy.value=false}
}

async function waitForSceneImage(storyId:string,sceneId:string):Promise<void>{
  const started=Date.now()
  // The API returns immediately while ComfyUI works; poll for completion.
  for(let attempt=0;attempt<460;attempt++){
    const result=await storyApi.getSceneImageStatus(storyId,sceneId)
    imageSeconds.value=Math.floor((Date.now()-started)/1000)
    if(result.status==='completed'){
      if(!result.url)throw new Error('Backend reported success without an image URL')
      const scene=project.value.scenes.find(s=>s.id===sceneId)
      if(scene){scene.imageUrl=result.url;scene.image=result.url}
      imageProgress.value='สร้างภาพและบันทึกเรียบร้อย'
      notify('สร้างภาพ AI สำเร็จ')
      return
    }
    if(result.status==='failed')throw new Error(result.error||'ComfyUI สร้างภาพไม่สำเร็จ')
    if(result.status==='idle'){
      imageProgress.value='รอตรวจสอบงานเดิมใน ComfyUI'
    }else{
      imageProgress.value=result.status==='running'
        ? (result.referenceUsed ? 'ComfyUI กำลังสร้างด้วยภาพอ้างอิง (img2img)' : 'ComfyUI กำลังสร้างจาก Prompt')
        : (result.referenceUsed ? 'รอคิว ComfyUI (ใช้ภาพอ้างอิง)' : 'รอคิว ComfyUI หรือรอผลการประมวลผล')
    }
    await new Promise(resolve=>setTimeout(resolve,2000))
  }
  throw new Error('หมดเวลาติดตามงาน กรุณาตรวจสอบ ComfyUI History')
}

async function resumeSceneImage(){
  const storyId=project.value.storyId
  const target=current.value
  if(!storyId||!target||generatingSceneId.value!==null)return
  // Also recovers PNGs left by the previous synchronous API implementation.
  if(target.imageUrl){
    if(!target.image)target.image=target.imageUrl
    return
  }
  try{
    const result=await storyApi.getSceneImageStatus(storyId,target.id)
    if(result.status==='completed'&&result.url){
      target.imageUrl=result.url
      target.image=result.url
      notify('กู้ภาพจาก ComfyUI สำเร็จ')
    }else if(result.status==='running'||result.status==='queued'){
      generatingSceneId.value=target.id
      imageError.value=''
      imageProgress.value='กำลังกู้สถานะงาน ComfyUI'
      try{await waitForSceneImage(storyId,target.id)}
      catch(error){imageError.value=error instanceof Error?error.message:'ติดตามงานไม่สำเร็จ'}
      finally{generatingSceneId.value=null}
    }
  }catch{
    // Do not disrupt offline storyboard editing when the API is unavailable.
  }
}

onMounted(()=>{void resumeSceneImage();void refreshProjects().catch(()=>{});void refreshProfiles().catch(()=>{});void storyApi.listVoices().then(v=>mossVoices.value=v).catch(()=>{})})
watch(selected,()=>{void resumeSceneImage()})

async function generateSceneImage(){
  const target=current.value
  if(!target||generatingSceneId.value!==null)return
  if(!target.imagePrompt.trim()){imageError.value='กรุณาใส่ Prompt สำหรับภาพก่อน';return}
  generatingSceneId.value=target.id
  imageError.value=''
  imageProgress.value='กำลังบันทึก Story ลง Backend'
  imageSeconds.value=0
  try{
    if(project.value.character.reference.startsWith('data:')){
      imageProgress.value='กำลังอัปโหลดภาพตัวละครให้ Backend'
      if(!await persistCharacter(false))throw new Error('บันทึกภาพอ้างอิงไม่สำเร็จ กรุณาตรวจสอบรูปแล้วลองอีกครั้ง')
    }
    const payload=storyPayload()
    const storyId=await storyApi.saveStory(payload,project.value.storyId)
    project.value.storyId=storyId
    // Check history before submitting, so an earlier successful image is
    // recovered instead of accidentally generating the same scene twice.
    if(!target.imageUrl){
      imageProgress.value='ตรวจสอบภาพที่สร้างไว้ก่อนหน้า'
      const existing=await storyApi.getSceneImageStatus(storyId,target.id)
      if(existing.status==='completed'&&existing.url){
        target.imageUrl=existing.url
        target.image=existing.url
        notify('กู้ภาพจาก ComfyUI สำเร็จ')
        return
      }
      if(existing.status==='queued'||existing.status==='running'){
        await waitForSceneImage(storyId,target.id)
        return
      }
    }
    imageProgress.value='กำลังส่งงานไป ComfyUI'
    const queued=await storyApi.startSceneImage(storyId,target.id)
    imageProgress.value=queued.referenceUsed?'ส่งภาพอ้างอิงเข้า ComfyUI แล้ว (img2img)':'กำลังสร้างภาพด้วย Prompt (ไม่มีภาพอ้างอิง)'
    await waitForSceneImage(storyId,target.id)
  }catch(error){
    imageError.value=error instanceof Error?error.message:'ไม่สามารถสร้างภาพ AI ได้'
    notify('สร้างภาพ AI ไม่สำเร็จ')
  }finally{
    generatingSceneId.value=null
  }
}
</script>

<template>
 <div class="app-shell">
  <aside class="sidebar"><div class="brand"><div class="brand-mark">✳</div><div><b>STORYFRAME</b><small>AI STORY STUDIO</small></div></div><div class="side-label">WORKSPACE</div><button class="nav active">▧ <span>โปรเจกต์ของฉัน</span></button><button class="nav" @click="notify('เลือกโปรเจกต์จากรายการล่าสุด')">◷ <span>ทำล่าสุด</span></button><div class="side-bottom"><div class="mini-avatar">SF</div><div><b>Local project</b><small>บันทึกในเครื่องนี้</small></div><button class="icon-btn" title="ส่งออกโปรเจกต์" @click="exportProject">⇩</button></div></aside>
  <main class="main"><header class="topbar"><div class="crumb">โปรเจกต์ <span>/</span> {{project.title}}</div><div class="top-actions"><select :value="currentProjectId||''" aria-label="โปรเจกต์ที่บันทึก" @change="loadProject(($event.target as HTMLSelectElement).value)"><option value="">โปรเจกต์ที่บันทึก…</option><option v-for="item in projects" :key="item.id" :value="item.id">{{item.title||'เรื่องใหม่'}}</option></select><button class="button outline" @click="newProject">＋ ใหม่</button><button class="button primary" :disabled="savingProject" @click="saveProject()">{{savingProject?'กำลังบันทึก…':'บันทึกโปรเจกต์'}}</button><label class="button quiet">นำเข้า JSON<input hidden type="file" accept="application/json" @change="importProject"></label><button class="button quiet" @click="exportProject">ส่งออก ↗</button></div></header>
   <section class="hero"><div><div class="eyebrow"><span class="pulse"></span> AI STORY VIDEO GENERATOR</div><h1>เปลี่ยนไอเดียให้เป็น<br><em>เรื่องราวที่มองเห็นได้</em></h1><p>เริ่มจาก Prompt เดียว วางฉาก สร้างภาพ แล้วเตรียมวิดีโอสำหรับ YouTube</p></div><div class="hero-art"><div class="orb orb-a"></div><div class="orb orb-b"></div><div class="art-card"><span>STORY</span><b>01 — 05</b><small>SCENES IN FRAME</small></div></div></section>
   <div class="phase-strip"><button v-for="n in 4" :key="n" :class="['phase-pill',{chosen:activePhase===n,done:n<activePhase}]" @click="activePhase=n"><span class="phase-num">{{n<activePhase?'✓':'0'+n}}</span><span><b>{{['สร้างเรื่องและภาพ','เสียงและวิดีโอ','ตัวละครคงที่','เตรียมลง YouTube'][n-1]}}</b><small>{{['STORYBOARD','VOICE & VIDEO','CHARACTER','PUBLISH'][n-1]}}</small></span><span v-if="n<4" class="phase-arrow">→</span></button></div>
   <section v-if="activePhase===1" class="content-grid"><div class="left-col"><div class="panel prompt-panel"><div class="panel-head"><div><span class="step-tag">PHASE 01 / STORY</span><h2>เล่าไอเดียของคุณ</h2></div><span class="spark">✦</span></div><textarea v-model="project.prompt" placeholder="ตัวอย่าง: เด็กสาวนักเวทถูกขับไล่ออกจากอาณาจักร ก่อนจะค้นพบว่าตัวเองมีพลังของจอมมาร…"></textarea><div class="settings-row"><label>แนวเรื่อง<select v-model="project.genre"><option>Anime Fantasy</option><option>นิทานผจญภัย</option><option>ไซไฟ</option><option>ดราม่า</option><option>สารคดี</option></select></label><label>ภาษา<select v-model="project.language"><option>ไทย</option><option>English</option></select></label><label>สัดส่วน<select v-model="project.ratio"><option>9:16</option><option>16:9</option><option>1:1</option></select></label></div><button class="button primary generate" :disabled="busy" @click="generateStoryboard">✦ {{busy?'Qwen กำลังวางแผนเรื่อง…':'สร้างสตอรี่บอร์ดด้วย AI'}} <span>→</span></button><div class="hint">AI สร้างบทบรรยายและ Prompt ภาพให้ตรงเหตุการณ์เดียวกันทุกฉาก · ใช้ Ollama + Qwen ตามค่า Backend</div><div v-if="plannerError" class="hint" role="alert">{{plannerError}} — ตรวจ STORY_PROVIDER / OLLAMA_URL / OLLAMA_STORY_MODEL ใน api/.env</div><button class="text-btn" :disabled="busy" @click="draftStory">ใช้โครงเรื่องตัวอย่าง (ไม่ใช้ AI)</button></div>
    <div class="panel scenes-panel"><div class="panel-head"><div><span class="step-tag">YOUR STORY</span><h2>สตอรี่บอร์ด <span class="count">{{project.scenes.length}} ฉาก</span></h2></div><button class="text-btn" @click="addScene">＋ เพิ่มฉาก</button></div><div v-if="!project.scenes.length" class="empty-state"><div class="empty-icon">▧</div><b>เรื่องราวของคุณจะเริ่มตรงนี้</b><span>ใส่ Prompt แล้วกดสร้างสตอรี่บอร์ด</span></div><div v-else class="scene-list"><button v-for="(s,i) in project.scenes" :key="s.id" :class="['scene-row',{selected:selected===i}]" @click="selected=i"><span class="scene-index">{{String(i+1).padStart(2,'0')}}</span><span class="scene-thumb" :style="(s.image||s.imageUrl)?{backgroundImage:`url(${s.image||s.imageUrl})`}:{}">{{(s.image||s.imageUrl)?'':'✦'}}</span><span class="scene-copy"><b>{{s.title||'ฉากใหม่'}}</b><small>{{s.narration||'เพิ่มบทบรรยายของฉากนี้'}}</small></span><span class="duration">{{s.duration}}s</span><span class="reorder"><i @click.stop="move(i,-1)">↑</i><i @click.stop="move(i,1)">↓</i></span></button></div></div></div>
    <div class="right-col"><div class="panel preview-panel"><div class="panel-head"><div><span class="step-tag">SCENE PREVIEW</span><h2>ภาพของฉาก</h2></div><button class="icon-btn" @click="notify('เลือกภาพที่ต้องการใช้กับฉากนี้')">···</button></div><div class="preview-frame" :class="project.ratio==='16:9'?'wide':''" :style="(current?.image||current?.imageUrl)?{backgroundImage:`url(${current.image||current.imageUrl})`}:{}"><template v-if="!(current?.image||current?.imageUrl)"><div class="preview-glow"></div><div class="mountain m1"></div><div class="mountain m2"></div><div class="preview-caption"><span>SCENE {{String(selected+1).padStart(2,'0')}}</span><b>{{current?.title||'ภาพจะปรากฏที่นี่'}}</b></div></template><span class="ratio-badge">{{project.ratio}}</span></div><div class="preview-controls"><label class="button outline">↑ อัปโหลดภาพ<input hidden type="file" accept="image/*" @change="addImage"></label><button class="button outline" :disabled="!current || generatingSceneId!==null" @click="generateSceneImage">{{generatingSceneId!==null ? 'กำลังสร้างภาพ AI…' : '✦ สร้างภาพ AI'}}</button></div><div v-if="generatingSceneId" class="hint" role="status">{{imageProgress}} · {{imageSeconds}} วินาที</div><div v-if="project.character.referenceUrl" class="hint" role="note">ภาพอ้างอิงที่บันทึก: {{project.character.name || 'ตัวละคร'}} — สร้างด้วย img2img (ภาพต้องอยู่ใน API Storage)</div><div v-else-if="project.character.reference.startsWith('data:')" class="hint" role="note">รูปตัวละครยังไม่ได้บันทึก — ระบบจะอัปโหลดก่อนสร้างภาพ</div><div v-if="imageError" class="hint" role="alert">{{imageError}}</div><div v-if="current" class="scene-fields"><label>บทบรรยาย<textarea v-model="current.narration" rows="3" placeholder="เขียนบทบรรยายฉากนี้"></textarea></label><label>Prompt สำหรับภาพ<textarea v-model="current.imagePrompt" rows="3" placeholder="รายละเอียดภาพ มุมกล้อง แสง และบรรยากาศ"></textarea></label><button class="button outline" :disabled="visualBusy || generatingSceneId!==null" @click="syncVisualFromNarration">{{visualBusy?'AI กำลังแปลงบทบรรยาย…':'✦ สร้าง Prompt ภาพจากบทบรรยาย'}}</button><div v-if="visualError" class="hint" role="alert">{{visualError}}</div><div class="hint">แก้บทบรรยายแล้วกดปุ่มนี้เพื่ออัปเดตภาพตามเหตุการณ์ จากนั้นกดสร้างภาพ AI อีกครั้ง · ภาพเดิมจะยังอยู่จนสร้างภาพใหม่สำเร็จ</div><div class="inline-fields"><label>เวลา (วินาที)<input type="number" min="1" max="60" v-model.number="current.duration"></label><label>การเคลื่อนภาพ<select v-model="current.motion"><option>ซูมเข้า</option><option>ซูมออก</option><option>แพนซ้าย</option><option>แพนขวา</option><option>นิ่ง</option></select></label></div></div><div v-else class="preview-note">เลือกหรือสร้างฉากเพื่อแก้ไขรายละเอียด</div></div><div class="tip-card"><span>✦</span><div><b>เคล็ดลับภาพที่เล่าเรื่อง</b><p>เขียนอารมณ์ แสง และมุมกล้องใน prompt เพื่อให้แต่ละฉากต่อเนื่องกัน</p></div></div></div></section>
   <section v-else-if="activePhase===2" class="phase-page"><div class="page-title"><span class="step-tag">PHASE 02 / PRODUCTION</span><h2>เติมเสียง แล้วประกอบเป็นวิดีโอ</h2><p>สร้างเสียงพากย์จาก MOSS Voice Studio ด้วย voice profile ที่บันทึกไว้</p></div><div class="production-grid"><div class="panel"><h3>เสียงพากย์ · MOSS</h3><p>เสียงที่สร้างจะถูกบันทึกในแต่ละฉากและใช้ต่อในการเรนเดอร์</p><label>โปรไฟล์เสียง<select v-model="selectedVoiceId"><option value="">เสียงเริ่มต้นของ MOSS</option><option v-for="voice in mossVoices" :key="voice.id" :value="voice.id">{{voice.name}} · {{voice.language}}</option></select></label><textarea :value="project.scenes.map(s=>s.narration).join('\n\n')" @input="project.voice=($event.target as HTMLTextAreaElement).value" placeholder="บทพากย์จะรวมจากฉากของคุณ"></textarea><div class="preview-controls"><button class="button primary" :disabled="voiceBusy||!mossVoices.length" @click="generateNarration">{{voiceBusy?'กำลังสร้างเสียง…':'✦ สร้างเสียงทุกฉาก'}}</button></div><div v-for="s in project.scenes" :key="s.id" class="voice-result"><b>{{s.title}}</b><audio v-if="s.audioUrl" :src="s.audioUrl" controls></audio></div><div v-if="!mossVoices.length" class="hint">ตรวจการเชื่อมต่อ MOSS_API_URL และ MOSS_API_KEY ใน api/.env และเปิด MOSS ที่พอร์ต 8001</div></div><div class="panel"><h3>ซับไตเติลและวิดีโอ</h3><p>ประกอบภาพ เสียง ซับไตเติล และการเคลื่อนภาพเป็นไฟล์พร้อมตรวจ</p><div class="export-preview"><span>MP4</span><b>{{project.scenes.length}} ฉาก</b><small>{{project.scenes.reduce((a,s)=>a+Number(s.duration||0),0)}} วินาทีโดยประมาณ · {{project.ratio}}</small></div><div class="preview-controls"><button class="button outline" @click="notify('สร้าง SRT พร้อมกับการเรนเดอร์วิดีโอ')">สร้างซับไตเติล</button><button class="button primary" @click="notify('ต้องเปิดใช้งาน video renderer ก่อนส่งออก MP4')">เรนเดอร์วิดีโอ →</button></div></div></div></section>
   <section v-else-if="activePhase===3" class="phase-page"><div class="page-title"><span class="step-tag">PHASE 03 / CONTINUITY</span><h2>ทำให้ตัวละครเป็นคนเดิมทุกฉาก</h2><p>บันทึกโปรไฟล์ไว้ใช้ซ้ำ ภาพอ้างอิงจะช่วยคุมลักษณะผ่าน img2img ใน ComfyUI</p></div><div class="panel character-panel"><div><label>โปรไฟล์ตัวละคร<select :value="selectedProfileId" @change="useCharacterProfile(($event.target as HTMLSelectElement).value)"><option value="">ตัวละครใหม่</option><option v-for="profile in characterProfiles" :key="profile.id" :value="profile.id">{{profile.name}}</option></select></label><div class="character-upload" :style="project.character.reference?{backgroundImage:`url(${project.character.reference})`}:{ }"><label>＋<small>เพิ่มภาพอ้างอิง<input hidden type="file" accept="image/png,image/jpeg" @change="addCharacter"></small></label></div></div><div class="character-fields"><label>ชื่อตัวละคร<input v-model="project.character.name" placeholder="เช่น ลูน่า"></label><label>รูปลักษณ์ที่ต้องคงเดิม<textarea v-model="project.character.look" rows="5" placeholder="ผมสีเงินยาว ดวงตาสีฟ้า เสื้อคลุมสีดำ มีเครื่องรางรูปพระจันทร์"></textarea></label><label>voice profile ของตัวละคร<select v-model="project.character.voiceId"><option :value="null">ใช้โปรไฟล์เสียงจากหน้าเสียง</option><option v-for="voice in mossVoices" :key="voice.id" :value="voice.id">{{voice.name}} · {{voice.language}}</option></select></label><div class="continuity-note">✦ คำบรรยายตัวละครจะถูกเพิ่มใน prompt ทุกฉาก ภาพอ้างอิงจะถูกอัปโหลดและใช้กับ ComfyUI img2img จริงเมื่อบันทึกตัวละครแล้ว (ควรตรวจสอบรูปก่อนสร้างภาพ)</div><div class="preview-controls"><button class="button primary" :disabled="savingCharacter || applyingCharacter" @click="saveCharacter">{{savingCharacter?'กำลังบันทึกภาพ…':'บันทึกตัวละครไว้ใช้ซ้ำ'}}</button><button class="button outline" :disabled="savingCharacter || applyingCharacter" @click="applyCharacterToScenes">{{applyingCharacter?'กำลังเชื่อมภาพ…':'ใช้กับทุกฉาก →'}}</button></div></div></div></section>
   <section v-else class="phase-page"><div class="page-title"><span class="step-tag">PHASE 04 / YOUTUBE</span><h2>พร้อมให้คนดูเห็นเรื่องของคุณ</h2><p>เตรียมข้อมูลวิดีโอและตรวจทานทุกไฟล์ก่อนเชื่อมต่อ YouTube</p></div><div class="production-grid"><div class="panel"><h3>ข้อมูลวิดีโอ</h3><label>ชื่อคลิป<input v-model="project.metadata.title" placeholder="ชื่อที่ชวนให้ติดตาม"></label><label>คำอธิบาย<textarea v-model="project.metadata.description" rows="5" placeholder="เล่าเรื่องย่อ ใส่เครดิต และข้อมูลที่ต้องการ"></textarea></label><label>แท็ก<input v-model="project.metadata.tags" placeholder="แฟนตาซี, เรื่องเล่า, anime"></label><div class="preview-controls"><button class="button outline" @click="project.metadata.title=project.title;project.metadata.description=project.prompt;notify('เตรียมข้อมูลจากโปรเจกต์แล้ว')">สร้าง metadata จากเรื่อง</button></div></div><div class="panel"><h3>ภาพปกและตรวจทาน</h3><div class="thumbnail-box" :style="project.thumbnail?{backgroundImage:`url(${project.thumbnail})`}:{}"><label v-if="!project.thumbnail">＋ เพิ่มภาพปก<input hidden type="file" accept="image/*" @change="addThumb"></label></div><label class="check-row"><input type="checkbox"> ยืนยันว่าตรวจทานวิดีโอและข้อมูลแล้ว</label><button class="button primary full" @click="notify('ตั้งค่า YouTube OAuth ใน API ก่อนเชื่อมต่อบัญชี')">เชื่อมต่อและอัปโหลดไป YouTube ↗</button><small class="hint">การอัปโหลดต้องตั้งค่า OAuth และต้องกดยืนยันก่อนทุกครั้ง</small></div></div></section>
   <footer class="footer"><span>STORYFRAME <b>·</b> สร้างจากจินตนาการของคุณ</span><span>บันทึกในเครื่องนี้ · ใช้ปุ่มบันทึกเพื่อเก็บโปรเจกต์</span></footer>
  </main><div v-if="toast" class="toast">{{toast}}</div>
 </div>
</template>
