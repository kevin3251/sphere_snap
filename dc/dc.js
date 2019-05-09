// dcenter: proxy of ucenter and relay center
// Date: 2018/03/08
// 
var dc = require('./app/appmain.js')
var fs = require('fs');
// conf:
// AppName: the name of app
// UCenter: the mma of uCenter
// IOC : the mma of IOC
var conf = JSON.parse(fs.readFileSync(__dirname +'/conf/config.json', 'utf8'));
if ( process.env.AppName ) conf.AppName = process.env.AppName;
if ( process.env.UCenter ) conf.UCenter = process.env.UCenter;
if ( process.env.IOC ) conf.IOC = process.env.IOC;
if ( process.env.MotebusGW ) conf.MotebusGW = process.env.MotebusGW;
if ( process.env.MotebusPort ) conf.MotebusPort = process.env.MotebusPort;
console.log('conf=%s',JSON.stringify(conf));
var islog = false
if ( process.env.Log || conf.Log ) islog = true;
console.log('conf=%s',JSON.stringify(conf));
if ( islog ){
  var os = require('os');
  var mlog = require('./app/mlog.js');
  mlog.init( 'dc_', os.platform(), __dirname,
    function(){
      mlog.savetoLog('self','dc init OK');
    }
  );
  dc.Start( conf, mlog );
}
else {
  dc.Start( conf );
}
