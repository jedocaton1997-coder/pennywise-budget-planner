import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { addCategory, addSubcategory, categoryLabel, useCategories } from "../data/categories";
import { resizeImageFileToSquare } from "../utils/imageTools";

const readImage=(file:File,onReady:(value:string)=>void)=>{
  resizeImageFileToSquare(file,512).then(onReady).catch(()=>undefined);
};

export function CategoryFields({defaultValue=""}:{defaultValue?:string}){
  const initial=defaultValue.split(" / "),categories=useCategories();
  const [category,setCategory]=useState(initial[0]||categories[0]?.name||"Other"),[subcategory,setSubcategory]=useState(initial[1]||""),[customizing,setCustomizing]=useState(false);
  const [customImage,setCustomImage]=useState("");
  const selected=categories.find(item=>item.name===category),subcategories=selected?.subcategories??[],storedValue=subcategory?`${category} / ${subcategory}`:category;
  const subcategoryOptions=useMemo(()=>subcategories,[selected?.name,subcategories.length]);
  return <>
    <div className="form-grid category-fields">
      <label>Category<select value={category} onChange={event=>{setCategory(event.target.value);setSubcategory("")}}>{categories.map(item=><option key={item.name} value={item.name}>{categoryLabel(item)}</option>)}</select></label>
      <label>Sub-category<select value={subcategory} onChange={event=>setSubcategory(event.target.value)}><option value="">None</option>{subcategoryOptions.map(item=><option key={item.name} value={item.name}>{item.image?"":`${item.icon} `}{item.name}</option>)}</select></label>
    </div>
    <input type="hidden" name="category" value={storedValue}/>
    <button type="button" className="link category-customize-toggle" onClick={()=>setCustomizing(value=>!value)}>{customizing?<X/>:<Plus/>}{customizing?"Close category options":"Personalize categories"}</button>
    {customizing&&<div className="category-customizer">
      <b>Add a category or sub-category</b>
      <div className="form-grid"><label>Parent category<select name="customParent" defaultValue={category}><option value="__new__">Create new category</option>{categories.map(item=><option key={item.name} value={item.name}>{categoryLabel(item)}</option>)}</select></label><label>Name<input name="customName" placeholder="e.g. Food Delivery"/></label></div>
      <div className="form-grid"><label>Icon<input name="customIcon" maxLength={4} placeholder="e.g. 🛵"/></label><label className="category-inline-image">Image<input type="file" accept="image/*" onChange={event=>{const file=event.target.files?.[0];if(file)readImage(file,setCustomImage)}}/>{customImage&&<span><img src={customImage} alt="Category preview"/>512×512 image ready</span>}</label></div>
      <button type="button" className="outline" onClick={event=>{const box=event.currentTarget.closest(".category-customizer")!,parent=(box.querySelector('[name="customParent"]') as HTMLSelectElement).value,name=(box.querySelector('[name="customName"]') as HTMLInputElement).value.trim(),icon=(box.querySelector('[name="customIcon"]') as HTMLInputElement).value.trim()||"📌";if(!name)return;if(parent==="__new__"){addCategory({name,icon,image:customImage||undefined,subcategories:[]});setCategory(name);setSubcategory("")}else{addSubcategory(parent,{name,icon,image:customImage||undefined});setCategory(parent);setSubcategory(name)}setCustomImage("");setCustomizing(false)}}><Plus/>Save category</button>
    </div>}
  </>
}
