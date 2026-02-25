const { resolve } = require('node:dns');
const fs = require("node:fs");
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
  var noDB = db?db.open:true
  if(noDB) db = new sqlite3.Database('./data.db', sqlite3.OPEN_READWRITE)

  const format = url.replace("https://","").replace("replay.pokemonshowdown.com/","").replace("smogtours-","").split("-")[0]
  await createTable(format,db)
  url="https://replay.pokemonshowdown.com/"+url.replace("https://","").replace("replay.pokemonshowdown.com/","")
  url = url.replace("?p2","").replace("#/","")
  let resp;
  try {
  resp = await fetch(url+".json");} catch(err){console.error("The URL that failed is "+url+", in the thread "+toururl+".","The error was "+err);return}
  if (resp.status===404) return
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
  if (noDB) db.close()
  return (format)
}
async function createTable(format,db){
  db.serialize(()=>{db.run('CREATE TABLE IF NOT EXISTS '+format+'(id INTEGER PRIMARY KEY AUTOINCREMENT,fetchid INTEGER,url TEXT UNIQUE,team1 TEXT,team2 TEXT,player1 TEXT,player2 TEXT,style1 TEXT,style2 TEXT,date INTEGER,isASample TEXT);',
    function (err){
      if (err) console.error(err.message)
      else if (this.changes>0) console.log("Created a table for the format "+format)
    }
  )})
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
  for (const x of LinkList){try { formats.push(await SingleReplayImport(x,db,tourName,tourRound,"https://www.smogon.com"+url1,id))}catch(err){console.error("Failed for "+x+" from https://www.smogon.co"+url1,err)}}
  formats = [...new Set(formats)]
  debugger
  for (var i=0;i<formats.length;i++)  await exportData(formats[i])
  db.close()
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
  const db=new sqlite3.Database('./data.db', sqlite3.OPEN_READONLY)
  await fs.mkdir('./format-data/'+format,{ recursive: true },(err)=>{if(err) {console.error("Folder creation for "+format+" failed");return}})
  db.all('SELECT '+format+'.*, t.url AS threadURL,t.threadName,t.threadRound FROM '+format+' JOIN fetchedThreads AS t ON fetchid=t.id ORDER BY date DESC ',(err,rows)=>{
    if (err) {console.error(err.message);return}
    else {
      fs.writeFile('./format-data/'+format+'/data.json',JSON.stringify(rows), err => {if (err) {console.error(err);}})
      }
  })
  db.close()
} 

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Functions relating to extracting transforming a pokepaste into a line in the sheet

function AddSampleFromPaste(url) {
  var raw=UrlFetchApp.fetch(url).getContentText().split("<pre>")
  var team= Array(raw.length-1)
  for (var i=1;i<raw.length;i++){var temp = raw[i].slice(raw[i].indexOf("<")+1,-1);team[i-1]=temp.slice(temp.indexOf(">")+1,temp.indexOf("<")).replace("-Mega","").toLowerCase().replace(" ","-").replace("-x","").replace("-y","").replace("-ash","")}
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[3];
  sheet.appendRow(team)
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Test functions

function TEST(){
  //url="https://replay.pokemonshowdown.com/gen7ou-2477367158-xosprqjtuwui6p8fu99ormstrwvlv1opw"
  //SingleReplayImport(url)
  
}
// url="https://www.smogon.com/forums/threads/smogon-masters-iii-finals-won-by-c0mp.3775594/"
// SmogThreadImport(url,"SM Trios")

// url="https://replay.pokemonshowdown.com/gen7ou-2000365211#/" //deleted replay
// url="https://replay.pokemonshowdown.com/smogtours-gen3ou-56583"
// SingleReplayImport(url)


function TEST3(){
  SingleReplayImport("https://replay.pokemonshowdown.com/smogtours-gen3ou-56583")
}


GETITALLOUT("./gen7ou-Replays.csv")
async function GETITALLOUT(path){
  // takes a csv of replays and imports them into the database
  const data = fs.readFileSync(path, { encoding: 'utf8', flag: 'r' }).split("\r\n").map(x=>x.split(",").slice(1,4).join(","))
  const uniqueData = [...new Set(data)]
  debugger
  for (var i=0;i<uniqueData.length;i++){
    var x=uniqueData[i].split(",")
    console.log((i+1)+"/"+uniqueData.length, "Importing thread : "+x[0])
    await SmogThreadImport(x[0],x[1],x[2])
  }
}

function redoListTeams(){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Main_sheet")
  const start=13
  const end=sheet.getLastRow()+1
  const team1Read=sheet.getRange(start,1,end-start,6).getFormulas()
  const team2Read=sheet.getRange(start,8,end-start,13).getFormulas()
  var team1Write=[]
  var team2Write=[]
  var mega1Write=[]
  var mega2Write=[]

  for (var i=0;i<end-start;i++){
    mega1Write.push([""])
    mega2Write.push([""])
    team1Write.push([])
    team2Write.push([])
    for (var j=0;j<6;j++){
      var mon1=team1Read[i][j].split("/").at(-1).slice(0,-7)
      var mon2=team2Read[i][j].split("/").at(-1).slice(0,-7)
      if (mon1.includes("-mega")) {mega1Write[i][0]=mon1;mon1=mon1.replace("-mega","").replace("-x","").replace("-y","")}
      if (mon2.includes("-mega")) {mega2Write[i][0]=mon2;mon2=mon2.replace("-mega","").replace("-x","").replace("-y","")}
      team1Write.at(-1).push(mon1)
      team2Write.at(-1).push(mon2)
    }
    console.log((i+start)+"/"+(end-1))
  }
  sheet.getRange(start,24,end-start,6).setValues(team1Write)
  sheet.getRange(start,30,end-start,1).setValues(mega1Write)
  sheet.getRange(start,31,end-start,6).setValues(team2Write)
  sheet.getRange(start,37,end-start,1).setValues(mega2Write)
}


function redoListStyles(){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Main_sheet")
  const start = 13
  const team1Read=sheet.getRange(start,1,sheet.getLastRow()-start,6).getFormulas().map(x=>x.map(y=>y.split("/").at(-1).slice(0,-7).replace("-mega","").replace("-x","").replace("-y","")))
  const team2Read=sheet.getRange(start,8,sheet.getLastRow()-start,13).getFormulas().map(x=>x.map(y=>y.split("/").at(-1).slice(0,-7).replace("-mega","").replace("-x","").replace("-y","")))
  const urlRead=sheet.getRange(start,1,sheet.getLastRow()-start,1).getFormulas()
  debugger
  var styleWrite=[]

  for (var i=0;i<=sheet.getLastRow()-start;i++){
    var data=JSON.parse(UrlFetchApp.fetch(url+".json").getContentText())
    var log = data["log"].split("\n")
    var style1=StyleGuesser(team1Read[i],log.filter(line=>line.includes("|move|p1a:")||line.includes("|switch|p1a:")))
    var style2=StyleGuesser(team2Read[i],log.filter(line=>line.includes("|move|p2a:")||line.includes("|switch|p2a:")))

    if (log.includes("|win|"+data["players"][1])){[style1,style2]=[style2,style1]}
    styleWrite.push([style1,style2])
  }
  sheet.getRange(start,16,sheet.getLastRow()-start,2).setValues(team1Write)
}

function createExport(){
  const sheetdata=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Main_sheet")
  const sheetout=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Exprot")
  const start = 13
  const end=sheetdata.getLastRow()+1
  const allForm=sheetdata.getRange(start,1,end-start,37).getFormulas()
  const allVal=sheetdata.getRange(start,1,end-start,37).getValues()
  const all = allForm.map((line,l)=>line.map((cell,c)=>{
    return cell==""?allVal[l][c]:cell
  }))
  var data=[]
  all.forEach(line=>{
    var toAdd=Array(24)
    toAdd[0]=line[0].split('"')[1]
    toAdd[1]=line[18].split('"')[1]||""
    toAdd[2]=line[18].split('"')[3]||""
    toAdd[3]=line[19].split('"')[3]||""
    for (var i=0;i<7;i++){
      toAdd[4+i]=line[23+i]
      toAdd[11+i]=line[30+i]
    }
    toAdd[18]=line[13]
    toAdd[19]=line[14]
    toAdd[20]=line[15]
    toAdd[21]=line[16]
    toAdd[22]=line[17].split("(")[1].slice(0,-1)
    toAdd[23]=line[20]
    data.push(toAdd)
  })
  debugger
  sheetout.getRange(1,1,data.length,data[0].length).setValues(data)
}

const warnedMessages = new Set();

function warnOnce(message) {
    if (!warnedMessages.has(message)) {
        console.warn(message);
        warnedMessages.add(message);
    }
}