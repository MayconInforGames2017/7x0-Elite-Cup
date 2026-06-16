import{readFileSync as r,writeFileSync as w}from'fs';
const P=JSON.parse(r('data/players.json','utf8'));
const R=JSON.parse(r('data/registrations.json','utf8'));
const S=new Set(P.map(p=>p.id));
const E='edicao:champions-league:2023-24';
const np=[],nr=[];
function a(id,nm,cl,pos,rt){
if(S.has(id)){process.stderr.write('DUP:'+id+'\n');return;}
S.add(id);np.push({id,name:nm});nr.push({playerId:id,clubId:cl,editionId:E,positions:pos,rating:rt});}
function g(pid,cl,pos,rt){nr.push({playerId:pid,clubId:cl,editionId:E,positions:pos,rating:rt});}
