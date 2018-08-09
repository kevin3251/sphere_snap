// dcenter: proxy of ucenter and relay center
// Date: 2018/03/08
// 
var dc = require('./app/appmain.js')
var fs = require('fs');
var conf = JSON.parse(fs.readFileSync(__dirname +'/conf/config.json', 'utf8'));
console.log('conf=%s',JSON.stringify(conf));
dc.Start( conf );