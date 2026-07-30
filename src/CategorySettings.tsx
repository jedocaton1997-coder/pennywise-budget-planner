import {useState} from 'react'
import {Bell,LogOut,Plus,ShieldCheck,Tag,Trash2,UserCircle,X} from 'lucide-react'
import {signOut} from 'firebase/auth'
import {addCategory,addSubcategory,deleteCategory,deleteSubcategory,updateCategory,updateSubcategory,useCategories} from './data/categories'
import {firebaseAuth} from './lib/firebase'
import {resizeImageFileToSquare} from './utils/imageTools'

type Editor={kind:'category';previousName?:string;name:string;icon:string;image?:string}|{kind:'subcategory';parentName:string;previousName?:string;name:string;icon:string;image?:string}

const readImage=(file:File,onReady:(value:string)=>void,onError:(message?:string)=>void)=>{
  resizeImageFileToSquare(file,512).then(onReady).catch(reason=>onError(reason instanceof Error?reason.message:undefined))
}

function CategoryAvatar({icon,image,name}:{icon:string;image?:string;name:string}){
  return <span className={`category-manager-icon${image?' has-image':''}`}>{image?<img src={image} alt={`${name} category`}/>:icon}</span>
}

export default function CategorySettings({onNotice}:{onNotice:(message:string)=>void}){
  const categories=useCategories(),[editor,setEditor]=useState<Editor|null>(null)
  const existing=Boolean(editor?.previousName)
  const user=firebaseAuth.currentUser
  const displayName=user?.displayName?.trim()||'Jed <3'
  const email=user?.email||'Signed in'
  const save=()=>{
    if(!editor||!editor.name.trim())return
    const name=editor.name.trim(),icon=editor.icon.trim()||'📌',image=editor.image
    if(editor.kind==='category'){
      if(editor.previousName){
        const current=categories.find(item=>item.name===editor.previousName)
        updateCategory(editor.previousName,{name,icon,image,subcategories:current?.subcategories??[]})
      }else addCategory({name,icon,image,subcategories:[]})
    }else if(editor.previousName) updateSubcategory(editor.parentName,editor.previousName,{name,icon,image})
    else addSubcategory(editor.parentName,{name,icon,image})
    onNotice(`${name} saved`);setEditor(null)
  }
  const remove=()=>{
    if(!editor?.previousName)return
    if(editor.kind==='category')deleteCategory(editor.previousName)
    else deleteSubcategory(editor.parentName,editor.previousName)
    onNotice(`${editor.previousName} deleted`);setEditor(null)
  }
  return <section className="category-settings">
    <div className="settings-overview-grid">
      <article className="panel settings-summary-card">
        <span><UserCircle/></span>
        <div>
          <small>Profile</small>
          <h2>{displayName}</h2>
          <p>{email}</p>
        </div>
        <button className="outline" onClick={()=>void signOut(firebaseAuth)}><LogOut/>Log out</button>
      </article>
      <article className="panel settings-summary-card">
        <span><ShieldCheck/></span>
        <div>
          <small>App preferences</small>
          <h2>Personal finance workspace</h2>
          <p>Currency: Philippine peso · Categories shared across all modules.</p>
        </div>
      </article>
      <article className="panel settings-summary-card">
        <span><Bell/></span>
        <div>
          <small>Notifications</small>
          <h2>Reminders enabled</h2>
          <p>Bill reminders, payment alerts, and planning signals stay managed here.</p>
        </div>
      </article>
    </div>
    <article className="panel category-manager">
      <div className="category-manager-head"><div><h2>Categories &amp; sub-categories</h2><p>Manage the shared list used throughout your transactions, bills, cards, and budgets.</p></div><button className="primary" onClick={()=>setEditor({kind:'category',name:'',icon:'📌'})}><Plus/>Add category</button></div>
      <div className="category-manager-list">{categories.map(category=><div className="category-manager-row" key={category.name}>
        <button className="category-manager-main clickable-row" type="button" onClick={()=>setEditor({kind:'category',previousName:category.name,name:category.name,icon:category.icon,image:category.image})}><CategoryAvatar icon={category.icon} image={category.image} name={category.name}/><div><b>{category.name}</b><small>{category.subcategories?.length??0} sub-categories</small></div></button>
        <div className="category-manager-subs">{(category.subcategories??[]).map(sub=><button key={sub.name} onClick={()=>setEditor({kind:'subcategory',parentName:category.name,previousName:sub.name,name:sub.name,icon:sub.icon,image:sub.image})}>{sub.image?<img src={sub.image} alt="" aria-hidden="true"/>:<span>{sub.icon}</span>}{sub.name}</button>)}<button className="add-subcategory" onClick={()=>setEditor({kind:'subcategory',parentName:category.name,name:'',icon:'📌'})}><Plus/>Add sub-category</button></div>
      </div>)}</div>
    </article>
    {editor&&<div className="modal-backdrop" onMouseDown={()=>setEditor(null)}><section className="modal category-editor-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}>
      <div className="modal-head"><div><h2>{existing?'Edit':'Add'} {editor.kind==='category'?'category':'sub-category'}</h2><p>{editor.kind==='subcategory'?`Under ${editor.parentName}`:'Available everywhere in MyPersonalFinance.'}</p></div><button className="icon-button" aria-label="Close" onClick={()=>setEditor(null)}><X/></button></div>
      <form onSubmit={event=>{event.preventDefault();save()}}><div className="category-editor-fields"><label>Icon<input aria-label="Category icon" maxLength={4} value={editor.icon} onChange={event=>setEditor({...editor,icon:event.target.value})}/></label><label>Name<input autoFocus required value={editor.name} onChange={event=>setEditor({...editor,name:event.target.value})} placeholder={editor.kind==='category'?'e.g. Pets':'e.g. Pet food'}/></label></div><div className="category-image-uploader"><CategoryAvatar icon={editor.icon||'📌'} image={editor.image} name={editor.name||'Category'}/><div><b>Category image</b><small>Upload an image to replace the icon. Images are saved as clean 512×512 icons.</small></div><label className="outline">Upload image<input type="file" accept="image/*" onChange={event=>{const file=event.target.files?.[0];if(file)readImage(file,value=>setEditor({...editor,image:value}),message=>onNotice(message||'Please upload a valid image file.'))}}/></label>{editor.image&&<button className="link" type="button" onClick={()=>setEditor({...editor,image:undefined})}>Use icon</button>}</div><div className="record-edit-actions"><button className="primary" type="submit"><Tag/>Save</button>{existing&&<button className="danger-outline" type="button" onClick={remove}><Trash2/>Delete</button>}</div></form>
    </section></div>}
  </section>
}
