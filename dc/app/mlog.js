var exports = module.exports = {};
var logprefix = '';
var fsep = '';
var fs;
var approot = '';
var log_file;
var log_path;
var crtimer;
var chkInterval = 600000;

// prefix: prefix of file name
// platform: win32 or linux
// fsobj: fs object
// apath: app root path
exports.init = function( prefix, platform, fsobj, apath, cb ){
    var filename, fpath;
    logprefix = prefix;
    fs = fsobj;
    if ( platform == 'win32' ) fsep = '\\';
    else fsep = '/';
    approot = apath;
    log_file = crlogfilename(logprefix);
    filename = fsep + 'log' + fsep + log_file + '.log';
    fpath = approot + filename;
    console.log('init: log path=%s', fpath);
    log_path = fs.createWriteStream(fpath, {flags:"a",encoding:"utf8"});
    crtimer = setInterval(function(){
        chkNewlogfile();
    }, chkInterval);
    if ( typeof cb == 'function' ) cb('OK');
}

exports.close = function(cb){
    log_path.close();
    if ( typeof cb == 'function' ) cb('OK');
}

exports.savetoLog = function(fm, data){
    var strlog = '';
    try {
        if ( typeof data == 'object' ) strlog = JSON.stringify(data);
        else if ( typeof data == 'string' ) strlog = data;
        if ( strlog != '' ){
            strlog = crlogtime() + '|' + fm + '|' + strlog;
            log_path.write(strlog + '\n');
        }
    }
    catch(err){
        console.log('savetolog: error=%s', err.message);
    }
}

var savetoLog = function(fm, data){
    try {
        var strlog = '';
        if ( typeof data == 'object' ) strlog = JSON.stringify(data);
        else if ( typeof data == 'string' ) strlog = data;
        if ( strlog != '' ){
            strlog = crlogtime() + ';' + fm + ';' + strlog;
            log_path.write(strlog + '\n');
        }
    }
    catch(err){
        console.log('savetolog: error=%s', err.message);
    }
}
      
var crlogtime = function(){
    var dt = new Date(); 
    var strtm = dt.getHours().toString() + ":" + dt.getMinutes().toString() + ":" + dt.getSeconds().toString() + ":" + dt.getMilliseconds().toString();
    return strtm;  
}

var crlogfilename = function(prefix){
    var dt = new Date();
    var yr = dt.getFullYear().toString();
    var mn = (dt.getMonth()+1).toString();
    if ( mn.length == 1 ) mn = '0' + mn;
    var dy = dt.getDate().toString();
    if ( dy.length == 1 ) dy = '0' + dy;
    var strfn = prefix + yr + mn + dy;
    return strfn;  
}

var chkNewlogfile = function(){
    try {
        var newfile = crlogfilename(logprefix);
        if ( newfile != log_file ) {
            savetoLog('self','new: ' + newfile + ', old: ' + log_file);
            log_file = newfile;
            crnewlog();
        }
    }
    catch(err){
        console.log('chkNewLogfile: error=%s', err.message);
    }
}

var crnewlog = function(){
    try {
        var filename, fpath;
        log_path.close();
        filename = fsep + 'log' + fsep + log_file + '.log';
        fpath = approot + filename;
        console.log('create: log path=%s', fpath);
        log_path = fs.createWriteStream(fpath, {flags:"a",encoding:"utf8"});
    }
    catch(err){
        console.log('crnewlog: error=%s', err.message);
    }
}


