(function(root){
function create(c){
 const money=n=>Math.round(n*100)/100;
 function quote(locations,employees,options={}){
  const venues=locations.map(v=>{
   const bundle=!!v.bundle,people=bundle||!!v.people,effective={guests:bundle||!!v.guests,finance:bundle||!!v.finance,loyalty:bundle||!!v.loyalty,people,academy:people||!!v.academy};
   const items=bundle?[{name:'Всё включено: Основа + 4 дополнения + 50 сотрудников',amount:c.bundle}]:[{name:'Основа',amount:c.base}];
   if(!bundle){for(const [key,name] of [['guests','Гости 360'],['finance','Финансы и контроль'],['loyalty','Лояльность']])if(effective[key])items.push({name,amount:c[key]});}
   const auraBlocks=effective.guests?Math.max(0,Math.floor(Number(v.auraBlocks)||0)):0,coordBlocks=Math.max(0,Math.floor(Number(v.coordBlocks)||0));
   return {id:v.id,name:v.name,bundle,effective,items,price:items.reduce((s,i)=>s+i.amount,0),auraBlocks,coordBlocks,topups:auraBlocks*c.auraTopup.price+coordBlocks*c.coordinatorTopup.price};
  });
  const uniqueEmployees=Math.max(0,Math.floor(Number(employees)||0)),teamEnabled=venues.some(v=>v.effective.people),academyEnabled=venues.some(v=>v.effective.academy),standaloneAcademy=venues.some(v=>v.effective.academy&&!v.effective.people),bundleCount=venues.filter(v=>v.bundle).length,includedEmployees=bundleCount*c.bundleSeats,overageEmployees=teamEnabled?Math.max(0,uniqueEmployees-includedEmployees):0;
  const academyOnlyEmployees=standaloneAcademy?(teamEnabled?Math.max(0,Math.floor(Number(options.academyOnlyEmployees)||0)):uniqueEmployees):0;
  const team=teamEnabled?(bundleCount?overageEmployees*c.peopleSeat:Math.max(c.peopleMinimum,uniqueEmployees*c.peopleSeat)):0,academy=academyOnlyEmployees*c.academySeat,software=venues.reduce((s,v)=>s+v.price,0),monthly=software+team+academy,annual=options.billing==='annual',discountRate=annual?c.annualDiscount:0,monthlyEquivalent=money(monthly*(1-discountRate)),period=annual?12:1,subscriptionDue=money(monthlyEquivalent*period),topups=venues.reduce((s,v)=>s+v.topups,0),total=money(subscriptionDue+topups);
  return {venues,software,team,academy,total,monthly,monthlyEquivalent,subscriptionDue,annual,annualSaving:money(monthly*12-subscriptionDue),discountRate,topups,teamEnabled,academyEnabled,standaloneAcademy,academyOnlyEmployees,uniqueEmployees,bundleCount,includedEmployees,overageEmployees,coordinatorIncluded:venues.length*c.coordinatorIncluded};
 }
 return {quote};
}
if(typeof module!=='undefined'&&module.exports)module.exports={create};else root.VilaxPricing={create};
})(typeof globalThis!=='undefined'?globalThis:this);
