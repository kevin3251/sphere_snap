// session: module for session
// Date: 2019/03/21
// Version: 1.3
// Update:
// Add EndSession

var exports = module.exports = {};
const ver = '1.1.20190424';
var regtable = [];
var fwdq = [];
var eicache = [];
const maxfwdqno = 30;
var ins;
var ucmma;
var MyMMA = '';
var MMAPort = '';
var MyUDID = '';
var MyWANIP = '';
var AppName = '';
var AuthKey = '';
var firstStart = true;
var snState = '';
var dcState = '';
var sdbg = 0;
var err;
var iocmma = '';
var updc = [];
var dcstart = false;
var EnableWatchDog = false;
var dcStartTimer = null;
var idleTimer = null;
const idleInterval = 180000;
const idleTimeout = 900000;
var EnableCleanCache = true;
var cacheTimer = null;
var XmsgRcve;
const cacheInterval = 1800000;
const cacheTimeout = 1800; //sec
//const cacheInterval = 60000;
//const cacheTimeout = 60; //sec
var XrpcDcService;
var XrpcDcSecService;
var mlog;

exports.Open = function(conf, rcve, dcsrv, dcsecsrv, inobj, log, cb){
    try {
        ucmma = (conf.UCenter) ? conf.UCenter : '';
        iocmma = (conf.IOC) ? conf.IOC: '';
        AppName = (conf.AppName) ? conf.AppName : '';
        if ( dcsrv ) XrpcDcService = dcsrv;
        if ( dcsecsrv ) XrpcDcSecService = dcsecsrv;
        ins = inobj;
        if ( log ) mlog = log;
        if ( typeof conf.UplinkDC == 'string' && conf.UplinkDC != '' ) {
            var up = conf.UplinkDC;
            updc = up.split(',');
        } 
        if ( typeof rcve == 'function' ) XmsgRcve = rcve;
        if ( firstStart == true ){
            err = require('./sserr');
            //DcStartHandler(cb);
            ins.On('state', function(state, info){
                MbusStateFunc(state, info);
            });
            ins.On('ss', ssAdmHandler);
        }
        if ( typeof cb == 'function' ) cb(true);
    }
    catch(e){
        console.log('session:open error=%s', e.message);
        if ( typeof cb == 'function' ) cb(false);
        if ( mlog ) mlog.savetoLog('ss:open', e.message);
    }
}

var MbusStateFunc = function(state, info){
    //console.log('MbusStateFunc %s typeof info=%s',state, typeof info);
    //console.log('MbusStateFunc %s info=%s',state, info);
    if ( state ) {
        if ( state != 'hoststate' ) {
            dcState = state;
            console.log('**dcState=%s',dcState);
        }
    }
    if ( state == 'opened' || state == 'opened2' ){
        ssreset(function(result){
            console.log('MbusStateFunc:Reset result=%s', JSON.stringify(result));
            if ( result.ErrCode == err.SS_OKCODE ){
                dcState = 'session';
                console.log('**dcState=%s',dcState);
                ins.PublishXrpc( AppName, XrpcDcService, function(result){
                    if (sdbg >= 1) console.log('PublishXrpc: result=%s', JSON.stringify(result));
                    if ( result.ErrCode == err.SS_OKCODE ){
                        ins.IsolatedXrpc( XrpcDcSecService, function(result){
                            if (sdbg >= 1) console.log('IsolatedXrpc: result=%s', JSON.stringify(result));
                            if ( updc.length > 0 ) SetupDcChannel();
                        });
                    }
                });
                ins.On('message', XmsgRcve);
            }
        }, true);
    }
    else if ( state == 'hoststate'){
        //console.log('hoststate: info=%s', JSON.stringify(info));
        if ( info.state ){
            if ( info.state == 'OnLine' ){
                if ( info.name && (dcState == 'session') ){
                    var hname = info.name;
                    if ( ucmma.indexOf(hname) >= 0 ){
                        ssreset(function(result){
                            console.log('MbusStateFunc:Reset result=%s', JSON.stringify(result));
                            if ( result.ErrCode == err.SS_OKCODE ){
                                dcState == 'session';
                                console.log('**dcState=%s',dcState);
                            }
                        }, true);
                    }
                }
            }
        }
    }
    //else if ( state == 'ready' || state == 'ready2' ){
    //    session.Init();
    //}
}

var SetupDcChannel = function(){
    var mma;
    for ( var i = 0; i < updc.length; i++ ){
        mma = 'dc@' + updc[i];
        console.log('SetupDcChannel mma=%s', mma);
        ins.CallXrpc( mma, 'echo', 'hello', null, null, function(result){
            console.log('SetupDcChannel result=%s', JSON.stringify(result));
        })
    }
}

var ssreset = function(cb, isreset){
    regtable = [];
    snState = '';
    fwdq = [];
    eicache = [];
    if ( isreset ) dcstart = false;
    //IssueDcStart(AuthKey);
    var tm = 1000 + Math.floor((Math.random() * 10) + 1) * 100;
    setTimeout(function(){
        DcStartHandler(cb);
    }, tm );
    ins.getmbInfo(function(reply){
        console.log('session: mbus info=%s', JSON.stringify(reply));
        if ( reply.ErrCode == err.SS_OKCODE ){
            MyMMA = reply.Mote.EiMMA;
            MMAPort = reply.Mote.EiPort;
            MyUDID = reply.Mote.EiUDID;
            MyWANIP = reply.Mote.WANIP;
            AppName = MyMMA.substr(0, MyMMA.indexOf('@'));
            console.log('session:mbus mymma=%s,mmaport=%s,appname=%s,UDID=%s', MyMMA, MMAPort, AppName, MyUDID); 
        }
    });
}

exports.iocEvent = function(evSource, evType, evClass, evBody){
    ssIocEvent(evSource, evType, evClass, evBody);
}

var ssIocEvent = function(evSource, evType, evClass, evBody){
    if ( iocmma != '' ) {
        if ( sdbg >= 2 ) console.log('session:ssIocEvent body=%s', JSON.stringify(evBody));
        var evid = ins.CreateTicket(7);
        ins.iocEvent(evid, evSource, evType, evClass, evBody);
    }    
}

var DcStartHandler = function(cb){
    //console.log('session:DcStart dcstart=%s', dcstart);
    //if ( snState != '' ) {
    //    if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG});
    //    return; 
    //}
    if ( dcstart == true ) {
        if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_ERROR_Busy,"ErrMsg":err.SS_ERROR_Busy_Msg});
        return;   
    }
    dcstart = true;
    IssueDcStart(AuthKey, function(result){
        console.log('session:DcStart result=%s', JSON.stringify(result));
        if ( result.ErrCode == err.SS_OKCODE ){
            snState = 'ready';
            firstState = false;
            if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG});
            if ( EnableWatchDog == true ) StartWatchDog();
            if ( EnableCleanCache == true ) StartCleanCache();
        }
        else {
            snState = 'ucfail';
            //if ( typeof cb == 'function' ) cb(result);
            if ( dcStartTimer != null ) clearTimeout( dcStartTimer );
            var tm = 3000 + Math.floor((Math.random() * 10) + 1) * 100;
            console.log('session:DcStart setTimout=%s', tm);
            dcStartTimer = setTimeout(function(){DcStartHandler(cb);},tm);
        }
        dcstart = false;
    });    
}

var IssueDcStart = function(akey, cb){
    var errmsg = '';
    try {
        ins.CallXrpc(ucmma, 'dcStartup', [akey], null, null, function(result){
            if ( sdbg >= 1 ) console.log('session:IssueDcStart result=%s', JSON.stringify(result));
            if ( result == true ){
                errmsg = err.SS_OKMSG;
                if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG});
            }
            else {
                errmsg = err.SS_ERROR_DCStartFail_Msg;
                if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_ERROR_DCStartFail,"ErrMsg":err.SS_ERROR_DCStartFail_Msg});
                if ( mlog ) mlog.savetoLog('ss:dcstart', errmsg);
            }
            ssIocEvent( MyMMA, 'info', 'in', {"Device":MyMMA,"action":"dcStartup","result":errmsg});
        });
    }
    catch(e){
        if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_ERRCODE,"ErrMsg":e.message});
        ssIocEvent(MyMMA, 'error', 'in', {"Device":MyMMA,"action":"dcStartup","result":e.message});
        if ( mlog ) mlog.savetoLog('ss:open', e.message);
    }
}

exports.StartSession = function(EiUDID, EiMMA, WIP, LIP, AppKey, EiToken, SToken, EiUMMA, EiUPort, cb){
    var ret;
    var wanip = WIP ? WIP : MyWANIP;
    if ( !wanip && LIP ) wanip = LIP;
    var regdata = {"MMA":EiMMA,"WIP":wanip,"LIP":LIP};
    //console.log('session:startsession snState=%s', snState);
    if ( snState == 'ready'){
        //if ( WIP != "" ){
            if ( ChkSessionPara(EiToken, SToken) == true ){
                if ( sdbg >= 0 ) console.log('session:StartSession SToken=%s,EiMMA=%s', SToken, EiMMA);
                ins.CallXrpc(ucmma, 'eiStartSession', [EiUDID, EiMMA, wanip, LIP, AppKey, EiToken, SToken], null, null, function(reply){
                    if ( sdbg >= 0 ) console.log('session:StartSession reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode ){
                        if ( typeof cb == 'function' ) cb(reply);
                        ssIocEvent(MyMMA, 'error', 'in', {"Device":EiUMMA,"action":"startSession","result":reply.ErrMsg,"info":regdata});
                    }
                    else {
                        AddSessionInfo( AppKey, EiUMMA, EiUPort, wanip, LIP, reply, cb);
                        var ddn = reply.DDN;
                        var dtype = '';
                        if ( reply.EdgeInfo ){
                            var eginfo = reply.EdgeInfo;
                            device = eginfo.EiName ? eginfo.EiName : ( eginfo.EiUMMA ? eginfo.EiUMMA : '');
                            dtype = eginfo.EiType ? eginfo.EiType : '';
                        }
                        ssIocEvent(MyMMA, 'info', 'in', {"Device":device,"DDN":ddn,"Type":dtype,"action":"startSession","result":"OK","info":regdata});
                    }
                });
            }
            else {
                ret = {"ErrCode":err.SS_ERROR_NoRegData,"ErrMsg":err.SS_ERROR_NoRegData_Msg};
                if ( typeof cb == 'function' ) cb(ret); 
                ssIocEvent(MyMMA, 'error', 'in', {"Device":EiUMMA,"action":"startSession","result":ret.ErrMsg,"info":regdata});    
            }
        //}
        //else {
            // no WAN IP
        //    ret = {"ErrCode":err.SS_ERROR_NoWanIp,"ErrMsg":err.SS_ERROR_NoWanIp_Msg};
        //    if ( typeof cb == 'function' ) cb(ret); 
        //    ssIocEvent( MyMMA, 'error', 'in', {"Device":EiUMMA,"action":"startSession","result":ret.ErrMsg,"info":regdata});
        //}
    }
    else {
        // dc not ready
        let errmsg = '';
        if (snState == 'ucfail') {
            errmsg = err.SS_ERROR_UcFail_Msg;
            ret = {"ErrCode":err.SS_ERROR_UcFail,"ErrMsg":errmsg};
        }
        else {
            errmsg = err.SS_ERROR_DcNotReady_Msg;
            ret = {"ErrCode":err.SS_ERROR_DcNotReady,"ErrMsg":errmsg};
        }
        if ( typeof cb == 'function' ) cb(ret);
        ssIocEvent( MyMMA, 'error', 'in', {"Device":EiUMMA,"action":"startSession","result":ret.ErrMsg,"info":regdata});
        if ( snState == 'ucfail' ) ssreset(null, false);
        if ( mlog ) mlog.savetoLog('ss:startsession', errmsg);
        //if ( dcStartTimer == null ){
        //    var tm = 2000 + Math.floor((Math.random() * 10) + 1) * 100;
        //    dcStartTimer = setTimeout(function(){DcStartHandler(cb);},tm);
        //}
    }   
}

var ChkSessionPara = function(eitoken, stoken){
    if ( eitoken == '' ){
        if ( stoken == '' ) return true;
        else return false;
    }
    else {
        if ( stoken != '' ) return true;
        else return false;
    }
}

exports.EndSession = function(EiMMA, SToken, cb){
    EndSession(EiMMA, SToken, '', cb);
}

var EndSession = function(EiMMA, SToken, reason, cb){
    if ( snState == 'ready'){
        var ix = GetSessionInfo(SToken);
        if ( ix >= 0 ){
            regtable[ix].State = 'unreg';
            var ddn = regtable[ix].DDN;
            var device = regtable[ix].EiName ? regtable[ix].EiName : ( regtable[ix].EiUMMA ? regtable[ix].EiUMMA : '');
            ins.CallXrpc(ucmma, 'eiEndSession', [ EiMMA, SToken ], null, null, function(result){
                if ( typeof result == 'object' )
                    if ( sdbg >= 1 ) console.log('xrpc unreg result=%s', JSON.stringify(result));
                else
                    if ( sdbg >= 1 ) console.log('xrpc unreg result=%s', result);
                RmSessionInfo(SToken);
                if ( !result.ErrCode ){
                    if ( result == true ){
                        //RmSessionInfo(SToken);
                        ret = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG};
                    }
                    else
                        ret = {"ErrCode":err.SS_ERRCODE,"ErrMsg":"Unknown reason"};
                    if ( typeof cb == 'function' ) cb(ret);
                    if ( reason == 'Timeout' )
                        ssIocEvent( MyMMA, 'error', 'in', {"Device":device,"DDN":ddn,"action":"endSession","result":reason});
                    else if ( reason == '' )
                        ssIocEvent( MyMMA, 'info', 'in', {"Device":device,"DDN":ddn,"action":"endSession","result":ret.ErrMsg});
                }
                else {
                    if ( typeof cb == 'function' ) cb(result);
                    ssIocEvent( MyMMA, 'error', 'in', {"Device":device,"DDN":ddn,"action":"endSession","result":result.ErrMsg});
                }
            });
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_ERROR_NoRegData,"ErrMsg":err.SS_ERROR_NoRegData_Msg});
            ssIocEvent( MyMMA, 'error', 'in', {"Device":EiMMA,"action":"endSession","result":err.SS_ERROR_NoRegData_Msg});
        }
    }
    else {
        var errcode, errmsg;
        if ( snState == 'ucfail' ){
            errcode = err.SS_ERROR_UcFail;
            errmsg = err.SS_ERROR_UcFail_Msg;
        }
        else {
            errcode = err.SS_ERROR_DcNotReady;
            errmsg = err.SS_ERROR_DcNotReady_Msg;
        }
        if ( typeof cb == 'function' ) cb({"ErrCode":errcode,"ErrMsg":errmsg});
        ssIocEvent( MyMMA, 'info', 'in', {"Device":EiMMA,"action":"endSession","result":errmsg});
        ssreset(null, false);
        //if ( dcStartTimer == null ){
        //    var tm = 2000 + Math.floor((Math.random() * 10) + 1) * 100;
        //    dcStartTimer = setTimeout(function(){DcStartHandler(cb);},tm);
        //}
    }   
}

exports.ResetSession = function(EiUDID, DcMMA, EiUMMA, cb){
    // Get the list of session which match udid
    // Set timeout for timestamp checking
    // if timestamp doesn't be updated, then endsession
    var ret;
    if ( sdbg >= 1 ) console.log('ResetSession: EiUDID=%s, EiUMMA=%s', EiUDID, EiUMMA);
    GetSessionInfoByMMA( EiUMMA, function(ssinfo){
        if ( sdbg >= 1 ) console.log('ResetSession: session=%s', JSON.stringify(ssinfo));
        //ins.iocEvent('in', 'dc', EiUDID, 'info', 'reset session...', MyMMA);
        if ( ssinfo ){
            ssIocEvent( MyMMA, 'info', 'in', {"Device":EiUMMA,"action":"resetSession","result":"OK"});
            for ( var i = 0; i < ssinfo.length; i++ ){
                var tm = 100 + Math.floor((Math.random() * 10) + 1) * 100;
                setTimeout(function(ei, stoken){
                    EndSession(ei, stoken, 'Reset');
                },tm, ssinfo[i].EiMMA, ssinfo[i].SToken);
            }
            ret = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"ResetCount":ssinfo.length,"DC":MyMMA,"WIP":MyWANIP};
        }
        else ret = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"DC":MyMMA,"WIP":MyWANIP};
        if ( typeof cb == 'function'){
            cb(ret);
        }
    });
}

exports.AddDeviceInfo = function(SToken, Info){
    AddDeviceInfo(SToken, Info);
}

exports.GetSessionInfo = function(SToken){
    return GetSessionInfo(SToken); 
}

exports.RouteXmsg = function(head, body, cb){
    var stoken, from, target, to, data, msgtype;
    if ( sdbg >= 1 ) console.log('Session:RouteXmsg: body=%s', JSON.stringify(body));
    stoken = ( body.stoken ) ? body.stoken : '';
    from = {};
    msgtype = '';
    if( body.in ){
        if ( body.in.fm ) from = body.in.fm;
        if ( body.in.msgtype ) msgtype = body.in.msgtype;
    }
    target = ( body.target ) ? body.target : ''; 
    if ( body.to ){
        if ( typeof body.to == 'string') to = {"Target":body.to,"Topic":""};
        else to = body.to;
    }
    else to = {"Target":target,"Topic":""};
    data = ( body.data ) ? body.data : '';
    if ( InDcLoopback( from, to, data, cb ) == false ) {
        InTraceDcProc(body);
        var tkno;
        if ( snState == 'ready'){
            if ( sdbg >= 1 ) console.log('Session:RouteXmsg: stoken=%s,to=%s,data=%s %s', stoken, JSON.stringify(to), JSON.stringify(data), typeof(data));
            if ( stoken && ( to.Target  || to.DDN  ) && data ){
                var ix = GetSessionInfo(stoken);
                if ( ix >= 0 ){
                    if ( fwdq.length <= maxfwdqno ){
                        tkno = AddFwdTask('xmsg', ix, from, to, msgtype, head, body, cb);
                        if ( tkno == 0 ){
                            if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":err.SS_ERROR_NoTarget,"ErrMsg":err.SS_ERROR_NoTarget_Msg,"By":MyMMA}},"Reply":""});
                        } 
                    }
                    else {
                        if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":err.SS_ERROR_Busy,"ErrMsg":err.SS_ERROR_Busy_Msg,"By":MyMMA}},"Reply":""});
                    }
                }
                else if ( typeof cb == 'function' ) {
                    var errcode, errmsg;
                    errcode = err.SS_ERROR_NoRegData;
                    errmsg = err.SS_ERROR_NoRegData_Msg;
                    if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":errcode,"ErrMsg":errmsg,"By":MyMMA}},"Reply":""});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":err.SS_ERROR_InvalidData,"ErrMsg":err.SS_ERROR_InvalidData_Msg,"By":MyMMA}},"Reply":""});    
            }
            var newjob = ChkFwdTask();
            if ( newjob != null ) DoFwdTask( newjob );
        }
        else {
            var errcode, errmsg;
            if ( snState == 'ucfail' ) {
                errcode = err.SS_ERROR_UcFail;
                errmsg = err.SS_ERROR_UcFail_Msg;
            }
            else {
                errcode = err.SS_ERROR_DcNotReady;
                errmsg = err.SS_ERROR_DcNotReady_Msg;
            }
            if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":errcode,"ErrMsg":errmsg,"By":MyMMA}},"Reply":""});
            if ( snState == 'ucfail' ) ssreset(null, false);
            //if ( dcStartTimer == null ){
            //    var tm = 2000 + Math.floor((Math.random() * 10) + 1) * 100;
            //    dcStartTimer = setTimeout(function(){DcStartHandler(cb);},tm);
            //}
        }
    }
}

exports.RouteXrpc = function(head, body, cb){
    var stoken, from, target, to, msgtype;
    var func = '';
    var data;
    var tkno;
    if ( sdbg >= 1 ) console.log('RouteXrpc body=%s', JSON.stringify(body));
    stoken = ( body.stoken ) ? body.stoken : '';
    from = {};
    msgtype = '';
    if( body.in ){
        if ( body.in.fm ) from = body.in.fm;
        if ( body.in.msgtype ) msgtype = body.in.msgtype;
    }
    target = ( body.target ) ? body.target : ''; 
    if ( body.to ){
        if ( typeof body.to == 'string' ) to = {"Target":body.to,"Topic":""};
        else to = body.to;
    }
    else to = {"Target":target,"Topic":""};
    if ( sdbg >= 1 ) console.log('RouteXrpc stoken=%s,from=%s,to=%s', stoken, JSON.stringify(from), JSON.stringify(to));
    func = ( body.func ) ? body.func : '';
    data = ( body.data ) ? body.data : '';
    if ( InDcLoopback( from, to, data, cb ) == false ) {
        InTraceDcProc(body);
        if ( snState == 'ready'){
            if ( stoken  && ( to.Target || to.DDN ) && func && data ){
                var ix = GetSessionInfo(stoken);
                if ( ix >= 0 ){
                    tkno = AddFwdTask('xrpc', ix, from, to, msgtype, head, body, cb);
                    if ( tkno == 0 ){
                        if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":err.SS_ERROR_NoTarget,"ErrMsg":err.SS_ERROR_NoTarget_Msg,"By":MyMMA}},"Reply":""});
                    }
                }
                else if ( typeof cb == 'function' ) {
                    var errcode, errmsg;
                    errcode = err.SS_ERROR_NoRegData;
                    errmsg = err.SS_ERROR_NoRegData_Msg;
                    if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":errcode,"ErrMsg":errmsg,"By":MyMMA}},"Reply":""});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":err.SS_ERROR_InvalidData,"ErrMsg":err.SS_ERROR_InvalidData_Msg,"By":MyMMA}},"Reply":""});
            }
            var newjob = ChkFwdTask();
            if ( newjob != null ) DoFwdTask( newjob ); 
        }
        else {
            var errcode, errmsg;
            if ( snState == 'ucfail' ) {
                errcode = err.SS_ERROR_UcFail;
                errmsg = err.SS_ERROR_UcFail_Msg;
            }
            else {
                errcode = err.SS_ERROR_DcNotReady;
                errmsg = err.SS_ERROR_DcNotReady_Msg;
            }
            if ( typeof cb == 'function' ) cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":{"ErrCode":errcode,"ErrMsg":errmsg,"By":MyMMA}},"Reply":""});
            if ( snState == 'ucfail' ) {
                ssreset(null, false);
            }
            //if ( dcStartTimer == null ){
            //    var tm = 2000 + Math.floor((Math.random() * 10) + 1) * 100;
            //    dcStartTimer = setTimeout(function(){DcStartHandler(cb);},tm);
            //}
        }
    }
}

exports.poll = function(mma, cb){
    //console.log('--##session:poll mma=%s', mma);
    if ( typeof cb == 'function' ){
        var ret = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"result":[]};
        if ( snState == 'ucfail' ){
            ret.ErrCode = err.SS_ERRCODE;
            ret.ErrMsg = 'UC: fail';
        }
        else if ( snState != 'ready' ) {
            ret.ErrCode = err.SS_ERROR_DcNotReady;
            ret.ErrMsg = err.SS_ERROR_DcNotReady_Msg;
        }
        else {
            if ( mma ){
                //var rmma = mma.trim();
                var rmma = mma;
                if ( regtable.length > 0 ){
                    //console.log('session:poll regtable:0=%s', JSON.stringify(regtable[0]));
                    var eimma;
                    for( var i = 0; i < regtable.length; i++ ){
                        eimma = regtable[i].EiMMA;
                        //console.log('--##session:poll eimma=%s,einame=%s', eimma, regtable[i].EiName);
                        //if ( eimma ) eimma.trim();
                        if ( rmma == eimma ) {
                            regtable[i].TimeStamp = new Date();
                            ret.result.push(regtable[i].SToken);
                            break;
                        }
                    }
                }
                else {
                    console.log('--##session:poll regtable empty');
                }
            }
            else {
                ret.ErrCode = err.SS_ERROR_InvalidData;
                ret.ErrMsg = err.SS_ERROR_InvalidData_Msg;
            }
        }
        cb(ret);
    }
}

// Pre-process request and seperate targets
var AddFwdTask = function(method, regix, from, to, msgtype, head, body, cb){
    var ticket = ins.CreateTicket(7);
    var app = regtable[regix].AppId;
    var target;
    var type = '';
    var mode = '';
    var search = 'dev';
    var taskno = 0;
    if ( sdbg >= 1 ) console.log('Session:AddFwdTask method=%s,body=%s', method,JSON.stringify(body));
    target = to.Target ? to.Target : '';
    if ( to.DDN ) {
        target = to.DDN;
        search = 'ddn';
    }
    if ( target.indexOf(',') > 0 || target.indexOf('#') >= 0 ) type = 'multi';
    else type = 'one';
    if ( sdbg >= 1 ) console.log('Session:AddFwdTask target=%s',target);
    if ( target && from  && to ){
        //var mclass = (method == 'xrpc') ? 'call': 'send';
        var job = {"ticket":ticket,"method":method,"regix":regix,"type":type,"status":"","app":app,"from":from,"msgtype":msgtype,"fromMMA":head.from,"tartet":target,"to":to,"body":body,"cb":cb,"task":[],"reply":[]};
        if ( sdbg >= 1 ) console.log('AddFwdTask job=%s',JSON.stringify(job));
        var tarr = target.split(',');
        var tt;
        for ( var i = 0; i < tarr.length; i++ ){
            tt = tarr[i];
            tt = tt.trim();
            if ( tt != '' ){
                if ( tt.indexOf('##') >= 0 ) {
                    mode = 'group';
                    tt = tt.substr(1);
                } 
                else if ( tt.indexOf('#') >= 0 ) mode = 'localgroup';
                else mode = '';
            }
            var task = {"target":tt,"search":search,"mode":mode,"dcinfo":[]};
            job.task.push(task);
            taskno += 1;
        }
        if ( sdbg >= 2 ) console.log('Session:AddFwdTask: job=%s', JSON.stringify(job));
        if ( taskno > 0 ) fwdq.push(job);
    }
    return taskno;
}

var ChkFwdTask = function(){
    var ix;
    // remove finished job
    for( ix = fwdq.length-1; ix >= 0; ix-- ){
        if ( fwdq[ix].status == "ok" ) {
            RmFwdTask(ix);
        }
    }
    // find the first job
    for( ix = 0; ix < fwdq.length; ix++ ){
        if ( fwdq[ix].status == "" ) {
            fwdq[ix].status = 'exec';
            break;
        }
    }
    if ( ix < fwdq.length ) return fwdq[ix];
    else {
        //console.log('session:ChkFwdTask: no task');
        return null;
    }
}

var DoFwdTask = function(job){
    var type = job.type;
    if ( sdbg >= 2 ) console.log('session:DoFwdTask job=%s', JSON.stringify(job));
    var bret = SearchLocalTarget(job);
    //console.log('session:DoFwdTask searchlocaltarget return=%s', bret);
    if ( bret == true && type == 'one' ) DoFwdRouting(job);
    else SearchRemoteTarget(job, DoFwdRouting);
   
}

var RmFwdTask = function(ix){
    //console.log('RmFwdTask ix=%d', ix);
    if ( ix >= 0 && ix < fwdq.length ){
        fwdq.splice(ix,1);
    }
}

var EndFwdTask = function(job){
    //if ( sdbg >= 1 ) console.log('EndFwdTask job=%s', JSON.stringify(job));
    var reply = job.reply;
    var body = job.body;
    if ( reply.length > 0 && iocmma != '' ){
        var mclass, sdata, msg, result;
        mclass = (job.method == 'xrpc') ? 'call' : 'send';
        if ( typeof body.data == 'object' ) sdata = JSON.stringify(body.data);
        else sdata = body.data;
        if ( mclass == 'call')
            msg = body.func + ' ' + sdata;
        else
            msg = sdata;
        for ( var i = 0; i < reply.length; i++ ){
            if ( sdbg >= 2 ) console.log('EndFwdTask reply=%d %s', i+1, JSON.stringify(reply[i]));
            result = '';
            if ( reply[i].IN ){
                if ( reply[i].Reply ) {
                    if ( reply[i].Reply.ErrMsg ) result = reply[i].Reply.ErrMsg;
                }
                if ( !result ) {
                    if ( reply[i].IN.State ){
                        if ( reply[i].IN.State.ErrMsg ) result = reply[i].IN.State.ErrMsg;
                    }
                }
                if ( !result ) result = 'unknown error';
                ssIocEvent( MyMMA, 'info', mclass, {"From":reply[i].IN.From,"To":reply[i].IN.To,"msg":msg,"result":result});    
                if ( result != 'OK' ){
                    if ( mlog ) mlog.savetoLog('ss:' + mclass, result + ' ' + JSON.stringify(reply[i].IN.To));
                }
            }
            //if ( reply[i].IN )
            //    ssIocEvent( MyMMA, 'info', mclass, {"From":reply[i].IN.From,"To":reply[i].IN.To,"msg":msg,"result":reply[i].IN.State.ErrMsg});    
        }
    }
    //RmFwdTask(ix);
    var newjob = ChkFwdTask();
    if ( newjob != null ) DoFwdTask(newjob);
}


var DoFwdRouting = function(job){
    var method = job.method;
    if ( method == 'xrpc' ){
        DoFwdXrpcRouting(job); 
    }
    else {
        DoFwdXmsgRouting(job);
    }
}

var DoFwdXrpcRouting = function(job){
    try {
        var body = job.body;
        var data = body.data;
        var ufunc = body.func;
        var task = job.task;
        var reply = job.reply;
        var cb = job.cb;
        var ret;
        var timeout, waitreply;
        if ( body.in ){
            timeout = ( body.in.t1 ) ? body.in.t1 : null;
            waitreply = ( body.in.t2 ) ? body.in.t2 : null;
        }
        else {
            timeout = null;
            waitreply = null;
        }
        if ( task.length == 0 ){
            job.status = 'ok';
            //var target = body.target ? body.target : '';
            ret = {"IN":{"From":job.from,"To":job.to,"msgtype":job.msgtype,"State":{}},"Reply":""};
            ret.IN.State = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"By":MyMMA};
            reply.push(ret);
            if ( typeof cb == 'function' ) cb(ret);
            EndFwdTask(job);
            return;
        }
        var x = 0;
        var pm = [];
        for ( var i = 0; i < task.length; i++ ){
            if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting task%d=%s', i, JSON.stringify(task[i]));
            var dcinfo = task[i].dcinfo ? task[i].dcinfo : [];
            var target = task[i].target ? task[i].target : '';
            if ( dcinfo.length == 0 ) {
                if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting no dcinfo=%s', JSON.stringify(task[i]));
                pm[x] = new Promise(function(resolve){
                    var inctl = {"From":job.from,"To":{"Target":target,"Topic":job.to.Topic},"msgtype":job.msgtype,"State":{}};
                    var rmsg = {"IN":inctl,"Reply":""};
                    rmsg.IN.State = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"By":MyMMA};
                    resolve(rmsg);
                }).then(function(result){
                    if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                    reply.push(result);
                });
                x += 1;
            }
            else {
                if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting dcinfo=%s', JSON.stringify(dcinfo));
                for ( var j = 0; j < dcinfo.length; j++ ){
                    var dcn = dcinfo[j];
                    if ( dcn.dc ){
                        pm[x] = new Promise(function(resolve){
                            var umma, inctl, udata, DcMMA, nbody, ddn, dname, dtype, into, uid, dcindex;
                            ddn = dcn.DDN;
                            dname = dcn.Name;
                            dtype = dcn.Type;
                            uid = dcn.Uid;
                            key = dcn.key;
                            dcindex = dcn.index;
                            InTraceDcProc(body);
                            if ( dcn.dc == 'local' ){
                                umma = dcn.mma;
                                inctl = {"fm":job.from,"to":{"DDN":ddn,"Name":dname,"Type":dtype,"Uid":uid,"Topic":job.to.Topic},"msgtype":job.msgtype};
                                udata = {"in":inctl,"data":data};
                                if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting mma=%s data=%s',umma, JSON.stringify(udata));
                                if ( timeout > 5000 ) timeout -= 100;
                                if ( waitreply > 5000 ) waitreply -= 100;
                                ins.CallXrpc(umma, ufunc, udata, timeout, waitreply, function(result){
                                    if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                                    //resolve({"DDN":ddn,"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg});
                                    //resolve(result);
                                    var cState = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"By":MyMMA};
                                    resolve({"IN":{"From":udata.in.fm,"To":udata.in.to,"msgtype":udata.in.msgtype,"State":cState},"Reply":result});
                                });
                            }
                            else {
                                DcMMA = dcn.dc;
                                inctl = {"fm":job.from,"msgtype":job.msgtype};
                                into = {"DDN":ddn,"Name":dname,"Type":dtype,"Uid":uid,"Topic":job.to.Topic};
                                nbody = {"stoken":body.stoken,"in":inctl,"to":into,"func":body.func,"data":body.data,"timeout":timeout,"waitreply":waitreply};
                                if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting DC mma=%s, body=%s', DcMMA, JSON.stringify(nbody));
                                if ( timeout > 5000 ) timeout -= 2000;
                                if ( waitreply > 5000 ) waitreply -= 2000;
                                ins.CallXrpc(DcMMA, 'callto', nbody, timeout, waitreply, function(result){
                                    if ( sdbg >= 1 ) console.log('Session:DoFwdXrpcRouting DC result=%s', JSON.stringify(result));
                                    if ( result.ErrCode ){
                                        //if ( result.ErrCode != err.SS_OKCODE) DelEiCache(key);
                                        if ( result.ErrCode != err.SS_OKCODE) DelEiCacheByIndex(dcindex);
                                        var cState = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"By":MyMMA};
                                        resolve({"IN":{"From":nbody.in.fm,"To":nbody.to,"msgtype":nbody.in.msgtype,"State":cState},"Reply":result});
                                    }
                                    else 
                                        resolve(result);
                                });
                            }
                        }).then(function(result){
                            InTraceDcResp(result.Reply);
                            if ( sdbg >= 0 ) console.log('session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                            reply.push(result);
                        });
                        x += 1;
                    }
                    else {
                        pm[x] = new Promise(function(resolve){
                            var rmsg = {"IN":{"From":job.from,"To":job.to,"msgtype":job.msgtype,"State":{}},"Reply":""};
                            rmsg.IN.State = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"By":MyMMA};
                            resolve(rmsg);
                        }).then(function(result){
                            if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                            reply.push(result);
                        });
                        x += 1;
                    }
                }
            }   
        }
        if ( pm.length > 0 ){
            Promise.all(pm).then(function(){
                job.status = 'ok';
                if ( typeof cb == 'function' ) {
                    //if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting reply=%s', JSON.stringify(reply));
                    //if ( reply.length == 1 ) cb(reply[0]);
                    //else cb(reply);
                    cb(reply);
                }
                if ( sdbg >= 2 ) {
                    console.log('session:DoFwdXrpcRouting reply=%s', JSON.stringify(reply));
                    console.log('session:DoFwdXrpcRouting end=%s', JSON.stringify(job));
                }
                EndFwdTask(job);
            });
        }
        else {
            job.status = 'ok';
            if ( typeof cb == 'function' ) cb( reply );
            EndFwdTask(job);
        }
    }
    catch(err){
        console.log('session:DoFwdXrpcRouting error=%s', err.message);
        job.status = 'ok';
        ret = {"IN":{"From":job.from,"To":job.to,"msgtype":job.msgtype,"State":{}},"Reply":""};
        ret.IN.State = {"ErrCode":err.SS_ERRCODE,"ErrMsg":err.message,"By":MyMMA};
        reply.push(ret);
        if ( typeof cb == 'function' ) cb(ret);
        EndFwdTask(job);
    }
    
}

var DoFwdXmsgRouting = function(job){
    try {
        var body = job.body;
        var data = body.data;
        var task = job.task;
        var reply = job.reply;
        var cb = job.cb;
        var pm = [];
        var ret;
        var timeout, waitreply;
        if ( typeof body.in != 'undefined' ){
            timeout = ( typeof body.in.t1 != 'undefined' ) ? body.in.t1 : null;
            waitreply = ( typeof body.in.t2 != 'undefined' ) ? body.in.t2 : null;
        }
        else {
            timeout = null;
            waitreply = null;
        }
        //if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting task=%s', JSON.stringify(task));
        if ( task.length == 0 ){
            job.status = 'ok';
            //var target = body.target;
            ret = {"IN":{"From":job.from,"To":job.to,"msgtype":job.msgtype,"State":{}},"Reply":""};
            ret.IN.State = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"By":MyMMA};
            if ( typeof cb == 'function' ) cb(ret);
            EndFwdTask(job);
            return;
        }
        var x = 0;
        for ( var i = 0; i < task.length; i++ ){
            var dcinfo, target;
            dcinfo = task[i].dcinfo ? task[i].dcinfo : [];
            target = task[i].target ? task[i].target : '';
            if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting task=%s', JSON.stringify(task[i]));
            if ( dcinfo.length == 0 ) {
                if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting no dcinfo=%s', JSON.stringify(task[i]));
                pm[x] = new Promise(function(resolve){
                    var inctl = {"From":job.from,"To":{"Target":target,"Topic":job.to.Topic},"msgtype":job.msgtype,"State":{}};
                    var rmsg = {"IN":inctl,"Reply":""};
                    rmsg.IN.State = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"By":MyMMA};
                    resolve(rmsg);
                }).then(function(result){
                    if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting result=%s', JSON.stringify(result));
                    reply.push(result);
                });
                x += 1;
            }
            else {
                if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting dcinfo=%s', JSON.stringify(dcinfo));
                for ( var j = 0; j < dcinfo.length; j++ ){
                    var dcn;
                    dcn = dcinfo[j];
                    if ( dcn ){
                        pm[x] = new Promise(function(resolve){
                            var umma, nbody, DcMMA, ddn, dname, dtype, inctl, into, uid, dcindex, eimma;
                            ddn = dcn.DDN;
                            dname = dcn.Name;
                            dtype = dcn.Type;
                            uid = dcn.Uid;
                            key = dcn.key;
                            dcindex = dcn.index;
                            eimma = dcn.EiMMA;
                            InTraceDcProc(body);
                            if ( dcn.dc == 'local' ){
                                umma = dcn.mma;
                                inctl = {"fm":job.from,"to":{"DDN":ddn,"Name":dname,"Type":dtype,"Uid":uid,"Topic":job.to.Topic},"msgtype":job.msgtype};
                                nbody = {"stoken":body.stoken,"in":inctl,"data":body.data};
                                if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting mma=%s data=%s',umma, JSON.stringify(nbody));
                                if ( timeout > 5000 ) timeout -= 100;
                                if ( waitreply > 5000 ) waitreply -= 100;
                                if ( sdbg >= 0 ) console.log('session:DoFwdXmsgRouting sendxmsg umma=%s', umma);
                                ins.SendXmsg( umma, nbody, [], timeout, waitreply, function(result){
                                    if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting sendxmsg result=%s', JSON.stringify(result));
                                    if ( result.ErrCode && result.ErrCode !== err.SS_OKCODE) {
                                        if ( result.ErrMsg == 'Address not found' ){
                                            EndSession(eimma, nbody.stoken, result.ErrMsg);
                                        }
                                    }
                                    var nState = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"By":MyMMA};
                                    resolve({"IN":{"From":nbody.in.fm,"To":nbody.in.to,"msgtype":nbody.in.msgtype,"State":nState},"Reply":result});
                                });
                            }
                            else {
                                DcMMA = dcn.dc;
                                inctl = {"fm":job.from,"msgtype":job.msgtype};
                                into = {"DDN":ddn,"Name":dname,"Type":dtype,"Uid":uid,"Topic":job.to.Topic};
                                nbody = {"stoken":body.stoken,"in":inctl,"to":into,"data":body.data,"timeout":timeout,"waitreply":waitreply};
                                if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting DC mma=%s, body=%s', DcMMA, JSON.stringify(nbody));
                                if ( timeout > 5000 ) timeout -= 2000;
                                if ( waitreply > 5000 ) waitreply -= 2000;
                                ins.CallXrpc(DcMMA, 'sendto', nbody, timeout, waitreply, function(result){
                                    if ( sdbg >= 1 ) console.log('Session:DoFwdXmsgRouting DC result=%s', JSON.stringify(result));
                                    if ( result.ErrCode ){
                                        //if ( result.ErrCode != err.SS_OKCODE) DelEiCache(key);
                                        if ( result.ErrCode != err.SS_OKCODE) DelEiCacheByIndex(dcindex);
                                        var cState = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"By":MyMMA};
                                        resolve({"IN":{"From":nbody.in.fm,"To":nbody.to,"msgtype":nbody.in.msgtype,"State":cState},"Reply":result});
                                    }
                                    else 
                                        resolve(result);
                                });
                            }
                        }).then(function(result){
                            InTraceDcResp(result.Reply);
                            if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting result=%s', JSON.stringify(result));
                            reply.push(result);
                            //reply.push({"target":target,"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"reply":result});
                        });
                        x += 1;       
                    }
                    else {
                        pm[x] = new Promise(function(resolve){
                            var rmsg = {"IN":{"From":job.from,"To":job.to,"msgtype":job.msgtype,"State":{}},"Reply":""};
                            rmsg.IN.State = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"By":MyMMA};
                            resolve(rmsg);
                        }).then(function(result){
                            if ( sdbg >= 2 ) console.log('session:DoFwdXmsgRouting result=%s', JSON.stringify(result));
                            reply.push(result);
                        });
                        x += 1;
                    }
                }
            }
        }
        if ( pm.length > 0 ){
            Promise.all(pm).then(function(){
                job.status = 'ok';
                if ( typeof cb == 'function' ) {
                    if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting reply=%s', JSON.stringify(reply));
                    //console.log('session:DoFwdXmsgRouting: typeof cb=%s', typeof cb);
                    if ( typeof cb == 'function' ){
                        //if ( reply.length == 1 ) cb(reply[0]);
                        //else cb(reply);
                        cb(reply);
                    }
                }
                EndFwdTask(job);
            });
        }
        else {
            job.status = 'ok';
            if ( typeof cb == 'function' ) cb(reply);
            EndFwdTask(job);
        }
    }
    catch(err){
        job.status = 'ok';
        console.log('session:DoFwdXmsgRouting error=%s', err.message);
        if ( typeof cb == 'function' ) {
            ret = {"IN":{"From":job.from,"To":job.to,"msgtype":job.msgtype,"State":{}},"Reply":""};
            ret.IN.State = {"ErrCode":err.SS_ERRCODE,"ErrMsg":err.message,"By":MyMMA};
            if ( typeof cb == 'function' ) cb(ret);
        }
        EndFwdTask(job);
    }
}

var SearchLocalTarget = function(job){
    var app, task, method;
    var bret = false;
    method = job.method;
    task = job.task;
    if ( sdbg >= 1 ) console.log('Session:SearchLocalTarget method=%s,task=%s', method, JSON.stringify(job.task));
    if ( task.length > 0 ) {
        bret = ChkMatchedSession(method, task);
        if ( sdbg >= 0 ) console.log('Session:SearchLocalTarget match %s task=%d %s', bret, job.task.length, JSON.stringify(job.task));
        return bret;
    }
    return bret;
}

var SearchRemoteTarget = function(job, next){
    var devix = job.regix;
    var EiMMA = regtable[devix].EiMMA;
    var SToken = regtable[devix].SToken;
    var task = job.task;
    var pm = [];
    var x = 0;
    if ( task.length > 0 ){
        for ( var i = 0; i < task.length; i++ ){
            var otask;
            otask = task[i];
            if ( ( otask.dcinfo.length == 0 && otask.mode != 'localgroup' ) || otask.mode == 'group' ){
                var key, dcq, eilist;
                key = otask.target ? otask.target : '';
                dcq = otask.dcinfo ? otask.dcinfo : [];
                if ( key != '' ){
                    eilist = SearchEiCache(key);
                    if ( eilist.length > 0 ){
                        for ( var k = 0; k < eilist.length; k++ ){
                            AddEiList(dcq, eilist[k]);
                        }
                        if ( sdbg >= 1 ) console.log('session:SearchRemoteTarget:SearchEiCache dcinfo=%s', JSON.stringify(dcq));
                    }
                    else {
                        pm[x] = new Promise(function(resolve){
                            var skey = key;
                            var sdcq = dcq;
                            var sbody = job.body;
                            InTraceDcProc(sbody);
                            SearchEi(EiMMA, SToken, skey, function(reply){
                                var DcUDID, DcMMA;
                                if ( sdbg >= 2 ) console.log('session:SearchRemoteTarget:SearchEi reply=%s', JSON.stringify(reply));
                                if ( typeof reply.ErrCode == 'undefined' ){
                                    if ( reply.length > 0 ){
                                        InTraceDcProc(sbody);
                                        for ( var k = 0; k < reply.length; k++ ){
                                            DcUDID = reply[k].DcUDID;
                                            if ( DcUDID != MyUDID){
                                                DcMMA = reply[k].DcMMA2;
                                                var di = ins.CreateTicket(5);
                                                var dcinfo = {"key":skey,"index":di,"dc":DcMMA,"UDID":reply[k].DcUDID,"mma":reply[k].EiMMA,"DDN":reply[k].DDN,"Name":reply[k].EiName,"Type":reply[k].EiType};
                                                AddEiList(sdcq, dcinfo);
                                                AddEiCache(dcinfo);
                                            }
                                        }
                                        //if ( k == reply.length ) resolve('OK');
                                        if ( sdbg >= 1 ) console.log('session:SearchRemoteTarget:SearchEi dcinfo=%s', JSON.stringify(dcq));
                                        resolve('OK');
                                    }
                                    else resolve('no matched');
                                }
                                else resolve(reply.ErrMsg);
                            });
                        }).then(function(result){
                            if ( sdbg >= 0 ) console.log('session:SearchRemoteTarget task=%s', JSON.stringify(otask));
                            if ( sdbg >= 2 ) console.log('session:SearchRemoteTarget result=%s', JSON.stringify(result));
                            //otask.dcinfo.push(result);
                        });
                        x += 1;
                    }
                }
            }
            //if ( sdbg >= 0 ) console.log('session:SearchRemoteTarget task=%s', JSON.stringify(otask));   
        }
        if ( pm.length > 0 ){
            Promise.all(pm).then(function(){
                if ( sdbg >= 1 ) console.log('Session:SearchRemoteTarget match task=%d %s', job.task.length, JSON.stringify(job.task));
                if ( typeof next == 'function' ) next(job);
            });
        }
        else {
            if ( typeof next == 'function' ) next(job);
        }
    }
    else {
        if ( typeof next == 'function') next(job); 
    }
}

var AddEiCache = function(ei){
    if ( typeof ei == 'object' ){
        var ntime = new Date();
        if ( sdbg >= 1 ) console.log('AddEiCache ei=%s', JSON.stringify(ei));
        eicache.push({"ei":ei,"stamp":ntime});
        return true;
    }
    return false;
}

var DelEiCacheByIndex = function(index){
    if ( index ){
        for ( var i = 0; i < eicache.length; i++ ){
            if ( index == eicache[i].ei.index ) {
                if (sdbg >= 1) console.log('session:DelEiCacheByIndex ei=%s', JSON.stringify(eicache[i].ei));
                eicache.splice(i,1);
            }
        }
        return true;
    }
    return false;
}

var SearchEiCache = function(key){
    var eiarr = [];
    if ( key != '' ){
        for ( var i = 0; i < eicache.length; i++ ){
            if ( key == eicache[i].ei.key ) {
                eiarr.push(eicache[i].ei);
            }
        }
    }
    console.log('session:SearchEiCache key=%s, eiarr=%s', key, JSON.stringify(eiarr));
    return eiarr;    
}

exports.CallXrpc = function(head, body, cb){
    var ddn, func, from, to, msgtype, data, timeout, waitreply;
    var newin;
    var ret;
    if( sdbg >= 1 ) console.log('Session:CallXrpc body=%s', JSON.stringify(body));
    //ddn = ( body.ddn ) ? body.ddn : '';
    from = ( body.in.fm ) ? body.in.fm : '';
    msgtype = ( body.in.msgtype ) ? body.in.msgtype : '';
    to = ( body.to ) ? body.to : '';
    ddn = ( body.to.DDN ) ? body.to.DDN : '';
    func = ( body.func ) ? body.func : '';
    timeout = ( body.timeout ) ? body.timeout : null;
    waitreply = ( body.waitreply ) ? body.waitreply : null;
    data = ( body.data ) ? body.data : '';
    if ( ddn != '' && func != '' && data != '' ){
        // find mma at local
        InTraceDcProc(body);
        var mma = SearchSessionInfo('xrpc', 'ddn', ddn);
        //if ( sdbg >= 1 ) console.log('Session:CallXrpc mma=%s', JSON.stringify(mma));
        if ( mma.length > 0 ){
            var umma, dname, dtype;
            umma = mma[0].MMA;
            dname = mma[0].Name;
            dtype = mma[0].Type;
            newin = {"fm":from,"to":{"DDN":ddn,"Name":dname,"Type":dtype,"Topic":to.Topic},"msgtype":msgtype};
            var nbody = {"in":newin,"data":data};
            if ( sdbg >= 1 ) console.log('Session:CallXrpc: local mma=%s, func=%s, data=%s', umma, func, JSON.stringify(nbody));
            if ( timeout > 5000 ) timeout -= 200;
            if ( waitreply > 5000 ) waitreply -= 200;
            ins.CallXrpc(umma, func, nbody, timeout, waitreply, function(reply){
                InTraceDcResp(reply);
                if ( sdbg >= 1 ) console.log('Session:CallXrpc: reply=%s', JSON.stringify(reply));
                if ( typeof cb == 'function' ) {
                    //cb({"DDN":ddn,"Target":name,"Reply":reply});
                    var cState = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"By":MyMMA};
                    cb({"IN":{"From":nbody.in.fm,"To":nbody.in.to,"msgtype":nbody.in.msgtype,"State":cState},"Reply":reply});
                }
            });
        }
        else {
            if ( typeof cb == 'function' ){
                var cState = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"DDN":ddn,"By":MyMMA};
                cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":cState},"Reply":""});
            }
        }
    }
    else {
        if ( typeof cb == 'function' ){
            var cState = {"ErrCode":err.SS_ERROR_InvalidData,"ErrMsg":err.SS_ERROR_InvalidData_Msg,"DDN":ddn,"By":MyMMA};
            cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":cState},"Reply":""});
        }
    }
}

exports.CallXmsg = function(head, body, cb){
    if ( sdbg >= 1 ) console.log('Session:CallXmsg body=%s', JSON.stringify(body));
    var ddn, from, to, msgtype, data, timeout, waitreply;
    from = ( body.in.fm ) ? body.in.fm : '';
    msgtype = ( body.in.msgtype ) ? body.in.msgtype : '';
    to = ( body.to ) ? body.to : '';
    ddn = ( body.to.DDN ) ? body.to.DDN : '';
    timeout = ( body.timeout ) ? body.timeout : null;
    waitreply = ( body.waitreply ) ? body.waitreply : null;
    data = ( body.data ) ? body.data : '';
    InTraceDcProc(body);
    if ( ddn != '' && data != '' ){
        var mma = SearchSessionInfo('xmsg', 'ddn', ddn);
        var umma, dname, dtype, newin, eimma;
        //if ( sdbg >= 1 ) console.log('Session:CallXmsg: target=%s,mma=%s', target, JSON.stringify(mma));
        if ( mma.length > 0 ){
            //umma = mma[0].EiUMMA + ':' + mma[0].EiUPort;
            //umma = GetRouteMMA(mma[0].EiUMMA, mma[0].EiUDID);
            umma = mma[0].MMA;
            dname = mma[0].Name;
            dtype = mma[0].Type;
            eimma = mma[0].EiMMA;
            newin = {"fm":from,"to":{"DDN":ddn,"Name":dname,"Type":dtype,"Topic":to.Topic},"msgtype":msgtype};
            var nbody = {"in":newin,"data":data};
            if ( sdbg >= 1 ) console.log('Session:CallXmsg: local mma=%s, data=%s', umma, JSON.stringify(nbody));
            if ( timeout > 5000 ) timeout -= 200;
            if ( waitreply > 5000 ) waitreply -= 200;
            ins.SendXmsg( umma, nbody, [], timeout, waitreply, function(result){
                InTraceDcResp(result);
                if ( sdbg >= 1 ) console.log('Session:CallXmsg: local result=%s', JSON.stringify(result));
                if ( result.ErrCode && result.ErrCode !== err.SS_OKCODE) {
                    if ( result.ErrMsg == 'Address not found' ){
                        EndSession(eimma, nbody.stoken, result.ErrMsg);
                    }
                }
                if ( typeof cb == 'function' ) {
                    var nState = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"By":MyMMA};
                    cb({"IN":{"From":nbody.in.fm,"To":nbody.in.to,"msgtype":nbody.in.msgtype,"State":nState},"Reply":result});
                }
            });
        }
        else {
            if ( typeof cb == 'function' ){
                var nState = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"DDN":ddn,"By":MyMMA};
                cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":nState},"Reply":""});
            }
        }
    }
    else {
        if ( typeof cb == 'function' ){
            var nState = {"ErrCode":err.SS_ERROR_InvalidData,"ErrMsg":err.SS_ERROR_InvalidData_Msg,"DDN":ddn,"By":MyMMA};
            cb({"IN":{"From":from,"To":to,"msgtype":msgtype,"State":nState},"Reply":""});
        }
    }
}

exports.ChkSToken = function(stoken){
    return GetSessionInfo(stoken);    
}

var SearchEi = function(EiMMA, SToken, Key, cb){
    if ( sdbg >= 1 ) console.log('Session:SearchEi Key=%s', Key);
    if ( Key == '' ){
        if ( typeof cb == 'function' ) cb([]);
        return;
    }
    ins.CallXrpc(ucmma, 'eiSearch', [EiMMA,SToken,Key], null, null, function(reply){
        if ( sdbg >= 1 ) console.log('Session:SearchEi Search:reply=%s', JSON.stringify(reply));
        var nreply = [];
        if ( typeof reply.ErrCode == 'undefined' ){
            if ( reply.length > 0 ){
                var ei;
                for ( var i = 0; i < reply.length; i++ ){
                    ei = reply[i];
                    // filter myself
                    if ( MyUDID != ei.DcUDUD ) AddEiList( nreply, ei );
                }
            }
            if ( sdbg >= 1 ) console.log('Session:SearchEi eiList=%s', JSON.stringify(nreply));
            if ( typeof cb == 'function' ) cb(nreply);
        }
        else {    
            if( typeof cb == 'function' ) cb(reply);
        }
    });
}

var AddEiList = function(list, ei){
    if ( list.length == 0 ){
        list.push(ei);
        return true;
    }
    else {
        for ( var i = 0; i < list.length; i++ ){
            if ( ei.DDN == list[i].DDN ) return false;
        }
        list.push(ei);
        return true;
    }
}

var NewSessionInfo = function(){
    var info = {"AppKey":"","EiToken":"","SToken":"","EiUMMA":"","EiUPort":"",
    "EiUDID":"","EiMMA":"","WIP":"","LIP":"","DDN":"","AppId":"","State":"",
    "EiOwner":"","EiName":"","EiType":"","EiTag":"","EiLoc":"",
    "UToken":"","Uid":"","UserName":"","MobileNo":"","NickName":"","Sex":"","EmailVerified":false,"MobileVerified":false,
    "TimeStamp":new Date()};
    return info;
}

var AddSessionInfo = function(AppKey, EiUMMA, EiUPort, WIP, LIP, ei, cb){
    //console.log('AddInfo: reginfo=%s', JSON.stringify(reginfo));
    var SToken = ei.SToken ? ei.SToken : '';
    if ( !SToken ) return;
    var ix = GetSessionInfo(SToken);
    var reginfo;
    if ( ix < 0 ){
        reginfo = NewSessionInfo();
    }
    else {
        reginfo = regtable[ix];
    }
    reginfo.AppKey = AppKey;
    reginfo.EiUMMA = EiUMMA;
    reginfo.EiUPort = EiUPort;
    reginfo.WIP = WIP;
    reginfo.LIP = LIP;
    if ( sdbg >= 1 ) console.log('AddSessionInfo EiUMMA=%s,WIP=%s,LIP=%s', EiUMMA, WIP, LIP);
    if ( sdbg >= 1 ) console.log('AddSessionInfo ix=%d,ei=%s', ix, JSON.stringify(ei));
    reginfo.EiToken = ei.EiToken;
    reginfo.SToken = ei.SToken;
    //reginfo.UToken = ei.UToken;
    reginfo.EiUDID = ei.EiUDID;
    reginfo.EiMMA = ei.EiMMA;
    reginfo.DDN = ei.DDN;
    reginfo.AppId = ei.AppId;
    if ( typeof ei.EdgeInfo == 'object' && ei.EdgeInfo != null ){
        reginfo.EiOwner = ei.EdgeInfo.EiOwner ? ei.EdgeInfo.EiOwner : '';
        reginfo.EiName = ei.EdgeInfo.EiName ? ei.EdgeInfo.EiName : '';
        reginfo.EiType = ei.EdgeInfo.EiType ? ei.EdgeInfo.EiType : '';
        reginfo.EiTag = ei.EdgeInfo.EiTag ? ei.EdgeInfo.EiTag : '';
        reginfo.EiLoc = ei.EdgeInfo.EiLoc ? ei.EdgeInfo.EiLoc : '';
    }
    if ( typeof ei.UserInfo == 'object' && ei.UserInfo != null ){
        reginfo.UToken = ei.UserInfo.UToken ? ei.UserInfo.UToken : '';
        reginfo.Uid = ei.UserInfo.Uid ? ei.UserInfo.Uid : '';
        reginfo.UserName = ei.UserInfo.UserName ? ei.UserInfo.UserName : '';
        reginfo.MobileNo = ei.UserInfo.MobileNo ? ei.UserInfo.MobileNo : '';
        reginfo.NickName = ei.UserInfo.NickName ? ei.UserInfo.NickName : '';
        reginfo.Sex = ei.UserInfo.Sex ? ei.UserInfo.Sex : '';
        reginfo.EmailVerified = ei.UserInfo.EmailVerified ? ei.UserInfo.EmailVerified : false;
        reginfo.MobileVerified = ei.UserInfo.MobileVerified ? ei.UserInfo.MobileVerified : false;
    }
    reginfo.State = 'reg';
    //console.log('--##AddSessionInfo ix=%d, SToken=%s, EiMMA=%s', ix, reginfo.SToken, reginfo.EiMMA);
    if ( ix < 0 ) regtable.push(reginfo);
    if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"result":reginfo});
    //console.log('--##AddSessionInfo regtable=%s', JSON.stringify(regtable));
}

var AddDeviceInfo = function(stoken, devinfo){
    //console.log('AddInfo: reginfo=%s', JSON.stringify(reginfo));
    if ( stoken != '' ){
        var ix = GetSessionInfo(stoken);
        if ( ix >= 0 ){
            regtable[ix].EiOwner = devinfo.EiOwner;
            regtable[ix].EiName = devinfo.EiName;
            regtable[ix].EiType = devinfo.EiType;
            regtable[ix].EiTag = devinfo.EiTag;
            regtable[ix].EiLoc = devinfo.EiLoc;
        }
        if ( sdbg >= 2 ) console.log('AddDeviceInfo: regtable=%s', JSON.stringify(regtable));
    }    
}

var RmSessionInfo = function(skey){
    if ( sdbg >= 1 ) console.log('RmSessionInfo: skey=%s', skey);
    if ( skey != '' ){
        var ix = GetSessionInfo(skey);
        if ( ix >= 0 && regtable[ix].State == 'unreg' ){
            regtable.splice(ix, 1);
            if ( sdbg >= 2 ) console.log('RmSessionInfo: regtable=%s', JSON.stringify(regtable));
        }
    }    
}


var ChkMatchedSession = function(method, task){
    var target, atype;
    var found, ftype, owner, ddn, dname, dtype, dtag, umma;
    var bret = false;
    if ( task.length > 0 ){
        for ( var i = 0; i < task.length; i++ ){
            atype = task[i].search ? task[i].search : ''; 
            target = task[i].target ? task[i].target : '';
            if ( sdbg >= 1 ) console.log('session:ChkMatchedSession: search=%s,target=%s', atype, target);
            found = false;
            if ( target ){
                for ( var k = 0; k < regtable.length; k++ ){
                    ftype = '';
                    if ( atype == 'dev' ){
                        //console.log('session.ChkMatchedSession: regtable%d=%s %s', k, regtable[k].DDN, regtable[k].EiName );
                        ddn = regtable[k].DDN;
                        if ( ddn ){
                            if ( ddn == target ) {
                                found = true;
                                ftype = 'ddn';
                            }
                        }
                        dname = regtable[k].EiName;
                        if ( dname ){
                            dname = dname.toLowerCase();
                            if ( dname == target.toLowerCase() ) {
                                found = true;
                                ftype = 'dname';
                            }
                        }
                        dtype = regtable[k].EiType;
                        if ( dtype ){
                            dtype = dtype.toLowerCase();
                            if ( dtype == target.toLowerCase() ) {
                                found = true;
                                ftype = 'dtype';
                            }
                        }
                        dtag = regtable[k].EiTag;
                        if ( dtag ){
                            dtag = dtag.toLowerCase();
                            var dtarr = [];
                            dtarr = dtag.split(',');
                            for ( var n = 0; n < dtarr.length; n++ ){
                                var dtagitem = dtarr[n];
                                if ( dtagitem ) dtagitem.trim();
                                if ( dtagitem && dtagitem == target.toLowerCase()){
                                    found = true;
                                    ftype = 'dtag';
                                }
                            }
                        }
                        umma = regtable[k].EiUMMA;
                        if ( umma ){
                            umma = umma.toLowerCase();
                            if ( umma == target.toLowerCase() ) {
                                found = true;
                                ftype = 'umma';
                            }
                        }
                        owner = regtable[k].EiOwner;
                        if ( owner ){
                            if ( owner == target ) {
                                found = true;
                                ftype = 'owner';
                            }
                        }
                    }
                    else if ( atype == 'ddn' ){
                        if ( target == regtable[k].DDN ) {
                            found = true;
                            ftype = ddn;
                        }
                    }
                    else if ( atype == 'udid' ){
                        if ( target == regtable[k].EiUDID ) {
                            found = true;
                            ftype = 'udid';
                        }
                    }
                    else if ( atype == 'app' ){
                        if ( regtable[k].AppId.indexOf(target) >= 0 ) {
                            found = true;
                            ftype = 'app';
                        }
                    }
                    if ( found ){
                        var umma;
                        umma = BuildMMA(method, k);
                        if ( sdbg >= 0 ) console.log('session:ChkMatchedSession ei=%s %s %s', ftype, regtable[k].DDN, umma);
                        if ( umma ){
                            var dcinfo = {"dc":"local","mma":umma,"EiMMA":regtable[k].EiMMA,"DDN":regtable[k].DDN,"Name":regtable[k].EiName,"Type":regtable[k].EiType,"Uid":regtable[k].EiOwner};
                            task[i].dcinfo.push(dcinfo);
                            found = false;
                            bret = true;
                        }
                        if ( ftype == 'ddn' ) break;
                    }
                } 
            }
        } 
    }
    if ( sdbg >= 2 ) console.log('session:ChkMatchedSession: task=%s', JSON.stringify(task));
    return bret;
}

// SearchSessionInfo: Get information list of session table by key
// method: protocal method: 'xmsg' or 'xrpc'
// stype: have 'all' and 'udid'
// skey: keyword of device
var SearchSessionInfo = function(method, stype, skey){
    var atype = stype;
    var reglist = [];
    var mma;
    if ( sdbg >= 2 ) console.log('SearchSessionInfo regtable=%s', JSON.stringify(regtable));
    if ( method && atype && skey  ) {
        atype = atype.toLowerCase();
        if ( atype == 'all' ) reglist = regtable;
        else if ( atype == 'ddn' ) {
            for ( var i = regtable.length-1; i >= 0; i-- ){
                if ( skey == regtable[i].DDN ){
                    mma = BuildMMA(method, i);
                    if ( mma ) {
                        reglist.push({"MMA":mma,"EiMMA":regtable[i].EiMMA,"DDN":regtable[i].DDN,"Name":regtable[i].EiName,"Type":regtable[i].Eitype,"Uid":regtable[i].EiOwner,"target":skey});
                        break;
                    }
                }
            }
        }
        else if ( atype == 'app' ) {
            for ( var i = regtable.length-1; i >= 0; i-- ){
                if ( skey == regtable[i].AppId ){
                    mma = BuildMMA(method, i);
                    if ( mma ) reglist.push({"MMA":mma,"EiMMA":regtable[i].EiMMA,"DDN":regtable[i].DDN,"Name":regtable[i].EiName,"Type":regtable[i].Eitype,"Uid":regtable[i].EiOwner,"target":skey});
                }
            }
        }
        else if ( atype == 'udid' ) {
            for ( var i = regtable.length-1; i >= 0; i-- ){
                if ( skey == regtable[i].EiUDID ){
                    mma = BuildMMA(method, i);
                    if ( mma ) reglist.push({"MMA":mma,"EiMMA":regtable[i].EiMMA,"DDN":regtable[i].DDN,"Name":regtable[i].EiName,"Type":regtable[i].Eitype,"Uid":regtable[i].EiOwner,"target":skey});
                }
            }
        }
        else if ( atype == 'umma' ) {
            var akey = skey;
            var umma;
            akey = akey.toLowerCase();
            for ( var i = regtable.length-1; i >= 0; i-- ){
                umma = regtable[i].EiUMMA;
                if ( umma != '' ){
                    umma = umma.toLowerCase();
                    if ( akey == umma || akey == umma.substr(0, umma.indexOf('@')) ){
                        mma = BuildMMA(method, i);
                        if ( mma ) reglist.push({"MMA":mma,"EiMMA":regtable[i].EiMMA,"DDN":regtable[i].DDN,"Name":regtable[i].EiName,"Type":regtable[i].Eitype,"Uid":regtable[i].EiOwner,"target":skey});
                    }
                }
            }
        }
        else if ( atype == 'dev' ){
            var akey = skey;
            var owner, dname, dtype, dtag;
            akey = akey.toLowerCase();
            for ( var i = regtable.length-1; i >= 0; i-- ){
                owner = (regtable[i].EiOwner) ? regtable[i].EiOnwer : '';
                if ( owner ){
                    //owner = owner.toLowerCase();
                    if ( owner == skey ){
                        mma = BuildMMA(method, i);
                        if ( mma ) reglist.push({"MMA":mma,"EiMMA":regtable[i].EiMMA,"DDN":regtable[i].DDN,"Name":regtable[i].EiName,"Type":regtable[i].Eitype,"Uid":regtable[i].EiOwner,"target":skey});
                        continue;
                    }
                }
                dname = (regtable[i].EiName) ? regtable[i].EiName : '';
                if ( dname ){
                    dname = dname.toLowerCase();
                    if ( dname == akey ){
                        mma = BuildMMA(method, i);
                        if ( mma ) reglist.push({"MMA":mma,"EiMMA":regtable[i].EiMMA,"DDN":regtable[i].DDN,"Name":regtable[i].EiName,"Type":regtable[i].Eitype,"Uid":regtable[i].EiOwner,"target":skey});
                        continue;
                    }
                }
                dtype = (regtable[i].EiType) ? regtable[i].EiType : '';
                if ( dtype ){
                    dtype = dtype.toLowerCase();
                    if ( dtype == akey ){
                        mma = BuildMMA(method, i);
                        if ( mma ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN,"Name":regtable[i].EiName,"Type":regtable[i].Eitype,"Uid":regtable[i].EiOwner,"target":skey});
                        continue;
                    }
                }
                dtag = (regtable[i].EiTag) ? regtable[i].EiTag : '';
                if ( dtag ){
                    dtag = dtag.toLowerCase();
                    var dtarr = [];
                    dtarr = dtag.spilt(',');
                    for ( var n = 0; n < dtarr.length; n++ ){
                        var dtagitem = dtarr[n];
                        if ( dtagitem ) dtagitem.trim();
                        if ( dtagitem && dtagitem == akey){
                            mma = BuildMMA(method, i);
                            if ( mma ) reglist.push({"MMA":mma,"EiMMA":regtable[i].EiMMA,"DDN":regtable[i].DDN,"Name":regtable[i].EiName,"Type":regtable[i].Eitype,"Uid":regtable[i].EiOwner,"target":skey});
                            continue;
                        }
                    }
                }
            }
        }
    }
    if ( sdbg >= 2 ) console.log('Getlist: type=%s, reglist=%s', stype, JSON.stringify(reglist));
    return reglist;
}

var BuildMMA = function( method, regindex ){
    var k = regindex;
    var umma = '';
    if ( k >= 0 ){
        if ( method == 'xmsg' ){
            umma = regtable[k].EiUMMA;
            umma = umma.substr(0, umma.indexOf('@')+1) + regtable[k].EiUDID;
            //umma = regtable[k].EiMMA;
        }
        else {
            umma = regtable[k].EiMMA;
        }
    }
    return umma;
}


// GetSessionInfo: Get information of session table
// skey: SToken of session
var GetSessionInfo = function(skey){
    var index = -1;
    if ( skey != '' ){
        for ( var i = 0; i < regtable.length; i++ ){
            //console.log('GetSessionInfo SToken=%s', regtable[i].SToken);
            if ( skey == regtable[i].SToken ){
                index = i;
                break;
            }
        }
    }
    return index; 
}

var GetSessionInfoByMMA = function(EiUMMA, cb){
    //console.log('GetSessionInfoByMMA EiUMMA=%s', EiUMMA );
    var retss = [];
    if ( typeof EiUMMA == 'string' && EiUMMA != '' ){
        for ( var i = 0; i < regtable.length; i++ ){
            //console.log('GetSessionInfoByMMA regitem=%s', JSON.stringify(regtable[i]));
            if ( EiUMMA == regtable[i].EiUMMA ){
                var ss = {"EiMMA":regtable[i].EiMMA,"SToken":regtable[i].SToken};
                retss.push(ss);
            }
        }
    }
    if ( typeof cb == 'function' ) cb(retss);
}

var StartWatchDog = function(){
    if ( idleTimer != null ) clearInterval(idleTimer);
    idleTimer = setInterval(function(){
        WatchIdleSession();
    }, idleInterval);
}

var WatchIdleSession = function(){
    //console.log('WatchIdleSession');
    if ( regtable.length > 0 ){
        var diff, ts, nt;
        var EiMMA, SToken;
        for ( var i = 0; i < regtable.length; i++ ){
            //console.log('WatchIdleSession scan edge=%s', JSON.stringify(regtable[i]));
            ts = regtable[i].TimeStamp;
            nt = new Date();
            diff = nt - ts; 
            if ( diff > idleTimeout ){
                //console.log('WatchIdleSession elapse edge=%s', regtable[i].EiMMA);
                SToken = regtable[i].SToken;
                EiMMA = regtable[i].EiMMA;
                EndSession(EiMMA, SToken, 'Timeout', function(result){
                    //console.log('WatchIdleSession:EndSession SToken=%s result=%s',SToken, JSON.stringify(result));
                });
            }
        }
        if ( sdbg >= 1 ) console.log('WatchIdleSession fwdq=%d', fwdq.length);
    }
}

var StartCleanCache = function(){
    if ( cacheTimer != null ) clearInterval(cacheTimer);
    cacheTimer = setInterval(function(){
        WatchCache();
    }, cacheInterval);
}

var WatchCache = function(){
    var ntime, utime, diff;
    ntime = new Date();
    if ( sdbg >= 1 ) console.log('session:WatchCache ei no=%d', eicache.length);
    while ( eicache.length > 0 ){
        utime = eicache[0].stamp;
        diff =(ntime.getTime() - utime.getTime()) / 1000;
        if ( diff >= cacheTimeout ) {
            var dc = eicache.shift();
            console.log('session:WatchCache remove %s', JSON.stringify(dc));
        }
        else break;
    } 
}

var ssAdmHandler = function(msg){
    try {
		var head = msg.head;
		var body = msg.body;
		var inctl = body.in;
		var req = body.request;
		var reply;
		if ( req == 'info' ){
			reply = {"response":"info","data":{"state":snState,"ver":ver}};
			ins.ReplyXmsg( head, reply, DefaultXmsgTimeout, 0 );
        }
        else if ( req == 'reg') {
            reply = {"response":"reg","data":regtable};
			ins.ReplyXmsg( head, reply, DefaultXmsgTimeout, 0 );
        }
        else if ( req == 'cache') {
            reply = {"response":"cache","data":eicache};
			ins.ReplyXmsg( head, reply, DefaultXmsgTimeout, 0 );
        }
	}
	catch(e){
		console.log('ssAdmHandler error=%s', e.message);
	}
}

var InTraceDcProc = function(body){
    try {
        if ( sdbg >= 1 ) console.log('InTraceDcProc: body=%s', JSON.stringify(body));
        var indata = body.data;
        var cmd = indata.cmd;
        //if ( cmd ) cmd = cmd.toLowerCase();
        if ( cmd == 'tracedc' ){
            var trace = indata.trace;
            var trdata = ins.GetTraceData();
            //console.log("XmsgRcve: trdata=%s", JSON.stringify(trdata));
            trace.push(trdata);
            return true;
        }
    }
    catch(e){
        console.log("InTraceDcProc error:%s", e.message);
    }
    return false;
}

var InTraceDcResp = function(reply){
    try {
        if ( sdbg >= 1 ) console.log('InTraceDcResp: reply=%s', JSON.stringify(reply));
        var resp = reply.response;
        //if ( resp ) resp = resp.toLowerCase();
        if ( resp == 'tracedc' ){
            var trace = reply.Trace;
            var trdata = ins.GetTraceData();
            //console.log("XmsgRcve: trdata=%s", JSON.stringify(trdata));
            trace.push(trdata);
        }
    }
    catch(e){
        console.log("InTraceDcResp error:%s", e.message);
    }
}

var InDcLoopback = function( from, to, data, cb ){
    var ret = false;
    try {
        if ( sdbg >= 1 ) console.log('InDcLookback: to=%s,data=%s', JSON.stringify(to), JSON.stringify(data));
        var ddn = to.DDN;
        var cmd = data.cmd ? data.cmd : '';
        var trace, resptrace;
        var reply = {"response":"ping","ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"Trace":[]};
        if ( ( cmd == 'ping' || cmd == 'trace' || cmd == 'tracedc' ) && ddn == 'dc' ){
            if ( typeof cb == 'function' ) {
                if ( cmd != 'ping' ) reply.response = cmd;
                reply.Trace = (data.trace) ? data.trace : [];
                resptrace = reply.Trace;
                trace = ins.GetTraceData();
                if ( trace ) resptrace.push(trace);
                var result = [{"IN":{"From":from,"To":to,"State":{"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"By":MyMMA}},"Reply":reply}];
                cb(result);
            }
            ret = true;
        }
    }
    catch(e){
        console.log("InDcLookback error:%s", e.message);
    }
    return ret;
}



