#!/usr/bin/env node

const { resolve } = require('node:dns');
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(__dirname, "format-data");
const { format } = require('node:path');

const sqlite3 = require('sqlite3').verbose();


threadOK = function(data){
  var n=0
  cacheRefresh()
  data.forEach(data => n+=SmogThreadImport(data[0],data[1],data[2]))  
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Functions relating to filling a line of the sheet from nothing but the replay url

async function SingleReplayImport(url,db,tourName="",tourRound="",toururl="",fetchid=-1) {
  const format = url.replace("https://","").replace("replay.pokemonshowdown.com/","").replace("smogtours-","").split("-")[0]
  
  await createTable(format,db)
  url="https://replay.pokemonshowdown.com/"+url.replace("https://","").replace("replay.pokemonshowdown.com/","")
  url = url.replace("?p2","").replace("#/","")
  let resp;
  try {
  resp = await fetch(url+".json");} catch(err){console.error("The URL that failed is "+url+", in the thread "+toururl+".","The error was "+err);return format}
  if (resp.status===404) return format
  const data = await resp.json()
  var log = data["log"].split("\n")
  var [play1,play2]= data["players"]
  var pos = log.indexOf("|clearpoke")
  if (pos==-1){
      var team1=[]
      var team2=[]
      var teams=["lmao",team1,team2]
      log.forEach(line=>{
      for (var i=1;i<3;i++){
          if (line.includes("|switch|p"+i+"a:")){
          var mon = line.split("|")[3].split(",")[0].trim().toLowerCase().replace(" ","-")
          if (!teams[i].includes(mon)){teams[i].push(mon)}
      }}
      })
      while (team1.length<6){team1.push("")}
      while (team2.length<6){team2.push("")}
  }
  else {
  var team1 = log.slice(pos+1,pos+7)
  var team2 = log.slice(pos+7,pos+13)
  for (var i =0; i<6;i++){
      [team1,team2].forEach(team=>{
      var txt = team[i]
      var end=10
      if (txt.includes(",",0)){end=txt.indexOf(",")}
      else {end=txt.lastIndexOf("|")}
      team[i]=txt.slice(9,end).replace(" ","-").toLowerCase().replace("-resolute","").replace("-*","").replace("%","").replace("-totem","")
      } )
  }}
  var [mega1,mega2]=["",""]
  var [mteam1,mteam2]=[[...team1],[...team2]]
  if (data["log"].includes("|-mega|p1a:")){var temp=data["log"].slice(data["log"].indexOf("|-mega|p1a:")+11,-1);temp=temp.slice(temp.indexOf("|")+1,-1);mega1=temp.slice(0,temp.indexOf("|")).toLowerCase()+"-mega";if (mega1=="charizard-mega"){mega1+="-"+temp[temp.indexOf("Charizardite ")+13].toLowerCase()};mteam1[team1.indexOf(temp.slice(0,temp.indexOf("|")).toLowerCase())]=mega1}
  mteam1=mteam1.map(mon=>{if(mon==""){return "unknown"} return mon})
  mteam2=mteam2.map(mon=>{if(mon==""){return "unknown"} return mon})
  
  
  if (data["log"].includes("|-mega|p2a:")){var temp=data["log"].slice(data["log"].indexOf("|-mega|p2a:")+11,-1);temp=temp.slice(temp.indexOf("|")+1,-1);mega2=temp.slice(0,temp.indexOf("|")).toLowerCase()+"-mega";if (mega2=="charizard-mega"){mega2+="-"+temp[temp.indexOf("Charizardite ")+13].toLowerCase()};mteam2[team2.indexOf(temp.slice(0,temp.indexOf("|")).toLowerCase())]=mega2}
  
  var [style1, style2]= [StyleGuesser(team1,log.filter(line=>line.includes("|move|p1a:")||line.includes("|switch|p1a:")),format),StyleGuesser(team2,log.filter(line=>line.includes("|move|p2a:")||line.includes("|switch|p2a:")),format)]
  
  if (log.includes("|win|"+play2)){[play1,play2,team1,team2,mteam1,mteam2,mega1,mega2,style1, style2]=[play2,play1,team2,team1,mteam2,mteam1,mega2,mega1,style2,style1];url+="?p2"}
  
  var toInsert = fetchid+',"'+[url,team1.concat(mega1).join("."),team2.concat(mega2).join("."),play1,play2,style1,style2].join('","')+'",'+data["uploadtime"]+',"'+IsASample([team1,team2],format)+'"'

  // console.log(`INSERT INTO `+format+" (fetchid,url,team1,team2,player1,player2,style1,style2,date,isASample) VALUE("+toInsert+");")

  db.serialize(() => {db.run(`INSERT INTO `+format+" (fetchid,url,team1,team2,player1,player2,style1,style2,date,isASample) VALUES ("+toInsert+");",(err)=>{if (err&false) {console.error(err.message);}})});
  // debugger
  return format
}
async function createTable(format,db){
  db.serialize(()=>{
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[format],
    (err, row) => {
      if (err) {
        console.error(err.message)
        return
      }
    
    const alreadyExists = !!row
    
    db.run('CREATE TABLE IF NOT EXISTS '+format+' (id INTEGER PRIMARY KEY AUTOINCREMENT,fetchid INTEGER,url TEXT UNIQUE,team1 TEXT,team2 TEXT,player1 TEXT,player2 TEXT,style1 TEXT,style2 TEXT,date INTEGER,isASample TEXT);',
    function (err){
      if (err) console.error(err.message)
      else if (!alreadyExists) console.log("Created a table for the format "+format)
    }
  )})})
}


function StyleGuesser(team,moves,format){
  if (format=="gen7ou"&((team.includes("tyranitar")&&team.includes("excadrill")) || team.includes("pelipper")|| team.includes("torkoal"))){return("Weather")}

  let values;
  try{
  values = fs.readFileSync('./format-data/'+format+'/styleScores.csv',{ encoding: 'utf8', flag: 'r' }).split("\n").splice(1).map(line=>line.split(","))}catch(err){warnOnce('There are no style ratings for '+format); return ""}

  //create an array of dictionnaries, where the keys are the pokemon's name
  var StyleScores=[{},{},{}]
  values.forEach(line=>{
    for (var j=0;j<3;j++){StyleScores[j][line[0]]=line[j+1]}
  })
  //calculate the score of the team
  var score = [0,0,0]
  for (var i = 0; i<6;i++){
    var mon=team[i].replace("-east","")
    if (Object.keys(StyleScores[0]).includes(mon+".")){
      var movesToSearch = []
      Object.keys(StyleScores[0]).forEach(mons=>{if (mons.includes(mon)){movesToSearch.push(mons.split(".").splice(1).map(x=>x.trim().toLowerCase()))}})
      var firstSwitch=moves.filter(turn=>turn.replace(" ","-").toLowerCase().includes(mon))[0]
      if (firstSwitch){var nick=firstSwitch.split("|")[2].slice(5)
      var movesUsed=[]
      moves.forEach(turn=>{var modTurn= turn.split(nick);if (modTurn[0].includes("|move|")&modTurn[1]){if(modTurn[1].includes("|")){movesUsed.push(modTurn[1].split("|")[1].toLowerCase().trim())}}})
      var overlap = movesToSearch.filter(moveList=>moveList.every(move=>movesUsed.includes(move)))
      mon+=". " + (overlap.length>0?overlap.at(-1).join(". "):"")}
      else {mon+=". "}
      // debugger
    }

    for (j=0;j<3;j++){
      score[j]+=(2**StyleScores[j][mon]||0)
    }
  }
  var names = ["Offence","Hyper Offence", "Defence"]
  
  //check if two styles are close in score
  let a = 1/closeness(score)
  if (a>=4){var modscore=[...score];modscore[maxes(score)[1]]=0;//debugger;
  return (names[maxes(score)[1]]+"/"+names[maxes(modscore)[1]])}
  
  return (names[maxes(score)[1]])
}

//takes 2 teams and checks if either of them has at least 5 mons in common with the teams on the sample sheet.
function IsASample(teams,format){
  let samples;
  try {
  samples = fs.readFileSync("./format-data/"+format+"/samples.csv",{ encoding: 'utf8', flag: 'r' }).split("\r\n").map(line=>line.split(","))} catch(err){warnOnce('There are no sample teams for '+format); return ""}
  // debugger
  for (var i=0;i<2;i++){
    if (samples.slice(0,samples.findIndex(item=>item.length==1&item[0]=="OLD")).some(s => s.filter(x=>teams[i].includes(x)).length>=5)){return "Yes"}
  }
  for (var i=0;i<2;i++){
    if (samples.some(s => s.filter(x=>teams[i].includes(x)).length>=5)){return "Yes (old)"}
  }  
  return "No"
}

function maxes(array){
  //returns a Int[2], 1st element is the max of the array and the 2nd is the 
  if (array.length==0){return -1}
  var argmax=0
  var max=array[0]
  for (var i=0;i<array.length;i++){
    if (array[i]>max) {[argmax,max]=[i,array[i]]}
  }
  return [max,argmax]
}

function closeness(array){
  var max=maxes(array)[0]
  var diff = Array(array.length)
  for (i=0;i<array.length;i++){diff[i]=(max-array[i])/max}
  var [min,argmin]=maxes(diff)
  for (i=0;i<array.length;i++){if (diff[i]<min && diff[i]>0){[min,argmin]=[diff[i],i]}}
  return min
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Functions relating to extracting all the replay links posted in a smogon thread

async function SmogThreadImport(url1,tourName,tourRound) {
  const db=new sqlite3.Database('./data.db', sqlite3.OPEN_READWRITE)

  url1=url1.split("#")[0].replace("smogon.com","").replace("www.","").replace("https://","").replace("http://","").replace(/page-\d+\/?$/, "")

  var page=1
  var DomainLink = url1+"page-"
  var baseurl=DomainLink+String(page)
  var url="https://www.smogon.com"+baseurl
  const id= await addToThreadDB(url,tourName,tourRound,db)
  let resp;
  try {resp = await fetch(url);} catch(err){console.error("The thread URL that failed is "+url+".","The error was "+err);return}
  var html = await resp.text()
  var LinkList = ReplayFinderFromHTML(html)
  while(html.includes(DomainLink+String(page+1))){
    page+=1
    console.log("Page "+String(page)+" exists!")
    baseurl=DomainLink+String(page)
    url="https://www.smogon.com"+baseurl
    try {resp = await fetch(url);} catch(err){console.error("The thread URL that failed is "+url+".","The error was "+err);return}
    var html = (await resp.text()).replace(/<aside class="message-signature">[\s\S]*?<\/aside>/g,'')
    // debugger
    LinkList = LinkList.concat(ReplayFinderFromHTML(html))
  }
  debugger
  var formats=[]
  console.log("About to import "+LinkList.length+" replays")
  for (const x of LinkList){try { formats.push(await SingleReplayImport(x,db,tourName,tourRound,"https://www.smogon.com"+url1,id))}catch(err){console.error("Failed for "+x+" from https://www.smogon.com"+url1,err)}}
  db.close()
  formats = [...new Set(formats)]
  debugger
  for (var i=0;i<formats.length;i++) await exportData(formats[i])
  
  return LinkList.length
}
function addToThreadDB(url,tourName,tourRound,db){
  return new Promise((resolve,reject)=>{ db.serialize(()=>
    db.run('INSERT OR IGNORE INTO fetchedThreads (url,threadName,threadRound) VALUES ("'+url+'","'+tourName+'","'+tourRound+'")',
      function (err) {
        if (err) return reject(err);
        if (this.changes >0) resolve(this.lastID);
        db.get(
                'SELECT id FROM fetchedThreads WHERE url ="'+url+'"', 
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row.id);})})
  ) })
}
function ReplayFinderFromHTML(html){
  var LinkList=[]
  while (html.includes('href="https://replay.pokemonshowdown.com/')){
    html=html.slice(html.indexOf('href="https://replay.pokemonshowdown.com/')+6)
    var replayLink = html.slice(0,html.indexOf('"'))
    LinkList.push(replayLink)
  }
  return(LinkList)
}
// exportData("gen7ou")
async function exportData(format){
  console.log("Exporting data from the format "+format)
  const db=new sqlite3.Database('./data.db', sqlite3.OPEN_READONLY)
  await fs.mkdir(path.join(dir,format),{ recursive: true },(err)=>{if(err) {console.error("Folder creation for "+format+" failed");return}})
  db.all('SELECT '+format+'.*, t.url AS threadURL,t.threadName,t.threadRound FROM '+format+' JOIN fetchedThreads AS t ON fetchid=t.id ORDER BY date DESC ',(err,rows)=>{
    if (err) {console.error(err.message);return}
    else {
      fs.writeFile(path.join(path.join(dir,format),'data.json'),JSON.stringify(rows), err => {if (err) {console.error(err);}})
      }
  })
  const formatList = await fs.readFileSync(path.join(dir,"format-list.txt"),{ encoding: 'utf8', flag: 'r' })
  if (!formatList.includes(format)) await fs.writeFileSync(path.join(dir,"format-list.txt"),formatList+","+format)
  db.close()
} 



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Test functions

// url="https://www.smogon.com/forums/threads/ancient-lower-tiers-premier-league-iv-replays.3776296/"
// SmogThreadImport(url,"ALTPL IV","")

// url="https://replay.pokemonshowdown.com/gen7ou-2000365211#/" //deleted replay
// url="https://replay.pokemonshowdown.com/smogtours-gen3ou-56583"
// const db=new sqlite3.Database('./data.db', sqlite3.OPEN_READWRITE)
// SingleReplayImport(url,db)
// db.close()


const warnedMessages = new Set();

function warnOnce(message) {
    if (!warnedMessages.has(message)) {
        console.warn(message);
        warnedMessages.add(message);
    }

}

useCSVFile()
async function useCSVFile(){
  const csv = await fs.readFileSync(path.join(__dirname, "listToImport.txt"),{ encoding: 'utf8', flag: 'r' }).split("\n").map(line=>line.replace("\r","").split(",")).filter(x=>x.length==3||x.length==2)
  for (infos of csv){
    console.log("Importing thread : "+infos[0])
    await SmogThreadImport(infos[0],infos[1],infos[2]||"")
  }
}