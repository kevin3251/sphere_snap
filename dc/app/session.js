var exports = module.exports = {};
var regtable = [];
var fwdq = [];
var ins;
var ucmma;
var MyMMA = '';
var MMAPort = '';
var MyUDID = '';
var MyWANIP = '';
var AppName = '';
var WaitReplyTimeout = 12;
const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var AuthKey = '';
var snState = '';
var sdbg = 1;
var err;
var EnableWatchDog = true;
var idleTimer = null;
var idleInterval = 180000;
var idleTimeout = 180000;

exports.Open = function(uc, inobj, cb){
    ucmma = uc;
    ins = inobj;
    err = require('./sserr');
    //console.log('err chk=%s', err.SS_OKMSG);
    IssueDcStart(AuthKey, function(result){
        console.log('session:open DcStart result=%s', JSON.stringify(result));
        if ( result.ErrCode == err.SS_OKCODE ){
            snState = 'start';
            ins.getmbInfo(function(reply){
                console.log('session:open DcStart get motebus info=%s', JSON.stringify(reply));
                if ( reply.ErrCode == err.SS_OKCODE ){
                    MyMMA = reply.Mote.EiMMA;
                    MMAPort = reply.Mote.EiPort;
                    MyUDID = reply.Mote.EiUDID;
                    MyWANIP = reply.Mote.WANIP;
                    AppName = MyMMA.substr(0, MyMMA.indexOf('@'));
                    console.log('session:open mymma=%s,mmaport=%s,appname=%s,UDID=%s', MyMMA, MMAPort, AppName, MyUDID); 
                    var evid = CreateTicket(7);
                    ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":MyUDID,"action":"dcStartup","result":result.ErrMsg});
                }
                if ( typeof cb == 'function' ) cb(reply);
            });
        }
        else {
            snState = 'ucfail';
            if ( typeof cb == 'function' ) cb(result);
        }
    });
}

exports.Reset = function(){
    regtable = [];
    snState = '';
    IssueDcStart(AuthKey);
}

var IssueDcStart = function(akey, cb){
    ins.CallXrpc(ucmma, 'dcStartup', [akey], function(result){
        try {
            if ( EnableWatchDog == true ) StartWatchDog();
            if ( typeof cb == 'function' ){
                if ( result == true ) cb({"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG});
                else {
                    var tm = Math.floor((Math.random() * 10) + 1) * 200;
                    setTimeout(function(data, callback){
                        ins.CallXrpc( dcenter, 'resetreg', data, null, null, function(reply){
                            if ( typeof callback == 'function' ) {
                                if ( reply == true ) callback({"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG});
                                else callback({"ErrCode":err.SS_ERROR_DCStartFail,"ErrMsg":err.SS_ERROR_DCStartFail_Msg});
                            };
                        });  
                    }, tm, [akey], cb);
                    //cb({"ErrCode":err.SS_ERROR_DCStartFail,"ErrMsg":err.SS_ERROR_DCStartFail_Msg});
                }
            }
        }
        catch(e){
            if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_ERRCODE,"ErrMsg":e.message});
        }
    });
}

exports.StartSession = function(EiUDID, EiMMA, WIP, LIP, AppKey, EiToken, SToken, EiUMMA, EiUPort, cb){
    var ret;
    if ( snState == 'start'){
        if ( WIP != "" ){
            ins.CallXrpc(ucmma, 'eiStartSession', [EiUDID, EiMMA, WIP, LIP, AppKey, EiToken, SToken], function(reply){
                if ( sdbg >= 1 ) console.log('session:StartSession reply=%s', JSON.stringify(reply));
                var evid = CreateTicket(7);
                if ( typeof reply.ErrCode == 'undefined' ){
                    AddSessionInfo(SToken, AppKey, EiUMMA, EiUPort, WIP, LIP, reply, cb);
                    var ddn = reply.DDN;
                    var device = '';
                    var dtype = '';
                    if ( typeof reply.EdgeInfo == 'object' ){
                        if ( reply.EdgeInfo.EiName != '' ) device = reply.EdgeInfo.EiName;
                        if ( reply.EdgeInfo.EiType != '' ) dtype = reply.EdgeInfo.EiType;
                    }
                    ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":device,"DDN":ddn,"Type":dtype,"action":"startSession","result":"OK"});
                }
                else {
                    if ( typeof cb == 'function' ) cb(reply);
                    ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":EiUMMA,"action":"startSession","result":result.ErrMsg});
                }
            });
        }
        else {
            // no WAN IP
            ret = {"ErrCode":err.SS_ERROR_NoWanIp,"ErrMsg":err.SS_ERROR_NoWanIp_Msg};
            if ( typeof cb == 'function' ) cb(ret); 
            var evid = CreateTicket(7);   
            ins.iocEvent(evid, MyMMA, 'error', 'in', {"Device":EiUMMA,"action":"startSession","result":ret.ErrMsg});
        }
    }
    else {
        // dc not ready
        if (snState == 'ucfail')
            ret = {"ErrCode":err.SS_ERROR_UcFail,"ErrMsg":err.SS_ERROR_UcFail_Msg};
        else
            ret = {"ErrCode":err.SS_ERROR_DcNotReady,"ErrMsg":err.SS_ERROR_DcNotReady_Msg};
        if ( typeof cb == 'function' ) cb(ret);
        var evid = CreateTicket(7);
        ins.iocEvent(evid, MyMMA, 'error', 'in', {"Device":EiUMMA,"action":"startSession","result":ret.ErrMsg});
    }   
}

exports.EndSession = function(EiMMA, SToken, cb){
    EndSession(EiMMA, SToken, cb);
}

var EndSession = function(EiMMA, SToken, cb){
    var evid = CreateTicket(7);
    if ( snState == 'start'){
        var ix = GetInfo(SToken);
        if ( ix >= 0 ){
            regtable[ix].State = 'unreg';
            var ddn = regtable[ix].DDN;
            var device = '';
            if ( regtable[ix].EiName != '' ) device = regtable[ix].EiName;
            ins.CallXrpc(ucmma, 'eiEndSession', [ EiMMA, SToken ], function(result){
                var ret;
                //var evid = CreateTicket(7);
                if ( typeof result == 'object' )
                    if ( sdbg >= 1 ) console.log('xrpc unreg result=%s', JSON.stringify(result));
                else
                    if ( sdbg >= 1 ) console.log('xrpc unreg result=%s', result);
                if ( typeof result.ErrCode == 'undefined' ){
                    if ( result == true ){
                        RmInfo(SToken);
                        ret = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG};
                    }
                    else
                        ret = {"ErrCode":err.SS_ERRCODE,"ErrMsg":"Unknown reason"};
                    if ( typeof cb == 'function' ) cb(ret);
                    if ( ret.ErrCode == err.SS_OKCODE ){
                        //ins.iocEvent('in', 'dc', device, 'info', 'end session OK', MyMMA);
                        ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":device,"DDN":ddn,"action":"endSession","result":"OK"});
                    }
                    else {
                        ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":device,"DDN":ddn,"action":"endSession","result":ret.ErrMsg});
                    }
                }
                else {
                    if ( typeof cb == 'function' ) cb(result);
                    ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":device,"DDN":ddn,"action":"endSession","result":result.ErrMsg});
                }
            });
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_ERROR_NoRegData,"ErrMsg":err.SS_ERROR_NoRegData_Msg});
            ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":EiMMA,"action":"endSession","result":err.SS_ERROR_NoRegData_Msg});
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
        ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":EiMMA,"action":"endSession","result":errmsg});
    }   
}

exports.ResetSession = function(EiUDID, EiUMMA, cb){
    // Get the list of session which match udid
    // Set timeout for timestamp checking
    // if timestamp doesn't be updated, then endsession
    if ( sdbg >= 1 ) console.log('ResetSession: EiUDID=%s, EiUMMA=%s', EiUDID, EiUMMA);
    GetInfoByMMA( EiUMMA, function(ssinfo){
        if ( sdbg >= 1 ) console.log('ResetSession: session=%s', JSON.stringify(ssinfo));
        //ins.iocEvent('in', 'dc', EiUDID, 'info', 'reset session...', MyMMA);
        if ( ssinfo.length > 0 ){
            var evid = CreateTicket(7);
            ins.iocEvent(evid, MyMMA, 'info', 'in', {"Device":EiUMMA,"action":"resetSession","result":"OK"});
            for ( var i = 0; i < ssinfo.length; i++ ){
                var tm = 100 + Math.floor((Math.random() * 10) + 1) * 100;
                setTimeout(function(ei, stoken){
                    EndSession(ei, stoken);
                },tm, ssinfo[i].EiMMA, ssinfo[i].SToken);
            }
        }
        if ( typeof cb == 'function'){
            var ret = {"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"ResetCount":ssinfo.length,"WIP":MyWANIP};
            cb(ret);
        }
    });
}

exports.AddDeviceInfo = function(SToken, Info){
    AddDeviceInfo(SToken, Info);
}

exports.GetSessionInfo = function(SToken){
    return GetInfo(SToken); 
}

exports.RouteXmsg = function(head, body, cb){
    if ( sdbg >= 1 ) console.log('Session:RouteXmsg: body=%s', JSON.stringify(body));
    var target = body.target;
    var stoken = body.stoken;
    if ( snState == 'start'){
        if ( target != "" && stoken != "" ){
            var ix = GetInfo(stoken);
            if ( ix >= 0 ){
                AddFwdTask('xmsg', ix, head, body, cb);
                var fwdix = ChkFwdTask();
                if ( fwdix >= 0 ) DoFwdTask(fwdix);    
            }
            else if ( typeof cb == 'function' ) {
                var errcode, errmsg;
                if ( regtable.length == 0 ){
                    errcode = err.SS_ERROR_DcRestart;
                    errmsg = err.SS_ERROR_DcRestart_Msg;
                }
                else {
                    errcode = err.SS_ERROR_NoRegData;
                    errmsg = err.SS_ERROR_NoRegData_Msg;
                }
                if ( typeof cb == 'function' ) cb({"DDN":"","Reply":{"ErrCode":errcode,"ErrMsg":errmsg,"Target":target,"By":MyMMA}});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"DDN":"","Reply":{"ErrCode":err.SS_ERROR_InvalidData,"ErrMsg":err.SS_ERROR_InvalidData_Msg,"Target":target,"By":MyMMA}});    
        }
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
        if ( typeof cb == 'function' ) cb({"DDN":"","Reply":{"ErrCode":errcode,"ErrMsg":errmsg,"Target":target,"By":MyMMA}});
    }
}

exports.RouteXrpc = function(head, body, cb){
    var target = '';
    var func = '';
    var stoken = '';
    var tkno;
    if ( typeof body.target == 'string' ) target = body.target;
    if ( typeof body.func == 'string' ) func = body.func;
    if ( typeof body.stoken == 'string' ) stoken = body.stoken;
    if ( snState == 'start'){
        if ( target != '' && func != '' && stoken != '' ){
            var ix = GetInfo(stoken);
            if ( ix >= 0 ){
                tkno = AddFwdTask('xrpc', ix, head, body, cb);
                if ( tkno == 0 ){
                    if ( typeof cb == 'function' ) cb({"DDN":"","Reply":{"ErrCode":err.SS_ERROR_NoTarget,"ErrMsg":err.SS_ERROR_NoTarget_Msg,"By":MyMMA}});
                }
                //var fwdix = ChkFwdTask();
                //if ( fwdix >= 0 ) DoFwdTask(fwdix);
            }
            else if ( typeof cb == 'function' ) {
                var errcode, errmsg;
                if ( regtable.length == 0 ) {
                    errcode = err.SS_ERROR_DcRestart;
                    errmsg = err.SS_ERROR_DcRestart_Msg;
                }
                else {
                    errcode = err.SS_ERROR_NoRegData;
                    errmsg = err.SS_ERROR_NoRegData_Msg;
                }
                if ( typeof cb == 'function' ) cb({"DDN":"","Reply":{"ErrCode":errcode,"ErrMsg":errmsg,"Target":target,"By":MyMMA}});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"DDN":"","Reply":{"ErrCode":err.SS_ERROR_InvalidData,"ErrMsg":err.SS_ERROR_InvalidData_Msg,"Target":target,"By":MyMMA}});
        } 
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
        if ( typeof cb == 'function' ) cb({"DDN":"","Reply":{"ErrCode":errcode,"ErrMsg":errmsg,"Target":target,"By":MyMMA}});
    }
    var fwdix = ChkFwdTask();
    if ( fwdix >= 0 ) DoFwdTask(fwdix);
}

exports.poll = function(mma, cb){
    //console.log('session:poll mma=%s', mma);
    var ret = [];
    if ( regtable.length > 0 ){
        //console.log('session:poll regtable:0=%s', JSON.stringify(regtable[0]));
        for( var i = 0; i < regtable.length; i++ ){
            if ( mma == regtable[i].EiMMA ) {
                regtable[i].TimeStamp = new Date();
                ret.push(regtable[i].SToken);
            }
        }
    }
    //console.log('session:poll typeof cb=%s', typeof cb);
    if ( typeof cb == 'function' ){
        cb(ret);
    }
}

var AddFwdTask = function(method, regix, head, body, cb){
    var ticket = CreateTicket(7);
    var app = regtable[regix].AppId;
    var from = '';
    var target = '';
    var type = '';
    var mode = '';
    var taskno = 0;
    //console.log('Session:AddFwdTask method=%s,body=%s', method,JSON.stringify(body));
    if ( typeof body.target == 'string' ) target = body.target;
    if ( target != '' ){
        if ( target.indexOf(',') > 0 || target.indexOf('#') >= 0 ) type = 'multi';
        else type = 'one';
        from = regtable[regix].DDN;
        if ( typeof regtable[regix].EiName == 'string'){
            if ( regtable[regix].EiName != '' ) from = regtable[regix].EiName;
        }
        var mclass = (method == 'xrpc') ? 'call': 'send';
        var msg, sdata;
        if ( typeof body.data == 'object' ) sdata = JSON.stringify(body.data);
        else sdata = body.data;
        if ( mclass == 'call')
            msg = body.func + ' ' + sdata;
        else
            msg = sdata;
        var job = {"ticket":ticket,"method":method,"regix":regix,"type":type,"status":"","app":app,"from":from,"target":target,"head":head,"body":body,"cb":cb,"task":[],"reply":[]};
        if ( type != 'normal' ){
            var tarr = target.split(',');
            var tt;
            for ( var i = 0; i < tarr.length; i++ ){
                tt = tarr[i];
                tt = tt.trim();
                if ( tt != '' ){
                    if ( tt.indexOf('#') >= 0 ) mode = 'group';
                    else mode = '';
                }
                var task = {"target":tt,"search":"dev","mode":mode,"dcinfo":[]};
                job.task.push(task);
                taskno += 1;
            }
        } 
        else {
            var task = {"target":target,"search":"dev","mode":mode,"dcinfo":[]};
            job.task.push(task);
            taskno += 1;
        }
        if ( sdbg >= 2 ) console.log('Session:AddFwdTask: job=%s', JSON.stringify(job));
        if ( taskno > 0 ) fwdq.push(job);
    }
    return taskno;
}

var DoFwdTask = function(fwdix){
    if ( sdbg >= 2 ) console.log('session:DoFwdTask fwdix=%d %s', fwdix, JSON.stringify(fwdq[fwdix]));
    var type = fwdq[fwdix].type;
    var method = fwdq[fwdix].method;
    var bret = SearchLocalTarget(method, fwdix);
    //console.log('session:DoFwdTask type=%s, method=%s, searchlocal=%s', type, method, bret);
    if ( bret == true ){
        if ( type == 'multi' ) SearchRemoteTarget(method, fwdix, DoFwdRouting);
        else DoFwdRouting(method, fwdix);
    }
    else {
        SearchRemoteTarget(method, fwdix, DoFwdRouting);
    }
}

var RmFwdTask = function(ix){
    if ( ix >= 0 && ix < fwdq.length ){
        fwdq.slice(ix,1);
    }
}

var EndFwdTask = function(ix){
    if ( sdbg >= 2 ) console.log('EndFwdTask job=%s', JSON.stringify(fwdq[ix]));
    var reply = fwdq[ix].reply;
    var body = fwdq[ix].body;
    var replymsg = '';
    if ( reply.length > 0 ){
        var ticket, mclass, from, target, sdata, msg, result;
        mclass = (fwdq[ix].method == 'xrpc') ? 'call' : 'send';
        from = fwdq[ix].from;
        if ( typeof body.data == 'object' ) sdata = JSON.stringify(body.data);
        else sdata = body.data;
        if ( mclass == 'call')
            msg = body.func + ' ' + sdata;
        else
            msg = sdata;
        var regix = fwdq[ix].regix;
        var fddn = typeof regtable[regix].DDN == 'string' ? regtable[regix].DDN : '';
        var ftype = typeof regtable[regix].EiType == 'string' ? regtable[regix].EiType : '';
        for ( var i = 0; i < reply.length; i++ ){
            //console.log('EndFwdTask reply=%d %s', i+1, JSON.stringify(reply[i]));
            ticket = CreateTicket(7);
            target = '';
            if ( typeof reply[i].DDN == 'string'){
                target = reply[i].DDN;
                //replymsg = (typeof reply[i].Reply.ErrMsg == 'string') ? reply[i].Reply.ErrMsg : 'OK';
            }
            if ( target == '' ) {
                if ( typeof reply[i].Target == 'string' ) target = reply[i].Target;
                else if ( typeof reply[i].Reply.Target == 'string' ) target = reply[i].Reply.Target;
                //replymsg = (typeof reply[i].Reply.ErrMsg == 'string') ? reply[i].Reply.ErrMsg : 'OK';
            }
            //console.log('EndFwdTask target=%s', target);
            //result = {"ErrCode":reply[i].ErrCode,"ErrMsg":reply[i].ErrMsg};
            if ( typeof reply[i].Reply == 'object' ){
                replymsg = (typeof reply[i].Reply.ErrMsg == 'string') ? reply[i].Reply.ErrMsg : 'OK';
            }
            else if ( typeof reply[i].ErrMsg == 'string' ){
                replymsg = reply[i].ErrMsg;
            }
            else if ( typeof reply[i] == 'string' ){
                replymsg = reply[i];
            }
            else if ( typeof reply[i] == 'object' ){
                replymsg = JSON.stringify(reply[i]);
            }
            ins.iocEvent(ticket, MyMMA, 'info', mclass, {"From":from,"DDN":fddn,"Type":ftype,"To":target,"msg":msg,"result":replymsg});    
        }
    }
    RmFwdTask(ix);
    var nextfwdix = ChkFwdTask();
    if ( nextfwdix >= 0 ) DoFwdTask(nextfwdix);
}

var ChkFwdTask = function(){
    // find the first task
    for( var ix = 0; ix < fwdq.length; ix++ ){
        if ( fwdq[ix].status == "" ) {
            fwdq[ix].status = 'exec';
            break;
        }
    }
    if ( ix < fwdq.length ) return ix;
    else {
        //console.log('session:ChkFwdTask: no task');
        return -1;
    }
}


var DoFwdRouting = function(method, fwdix){
    if ( method == 'xrpc' ){
        DoFwdXrpcRouting(fwdix); 
    }
    else {
        DoFwdXmsgRouting(fwdix);
    }
}

var DoFwdXrpcRouting = function(fwdix){
    if ( sdbg >= 2 ) console.log('DoFwdXrpcRouting start!!!');
    try {
        var body = fwdq[fwdix].body;
        var data = body.data;
        var ufunc = body.func;
        var task = fwdq[fwdix].task;
        var reply = fwdq[fwdix].reply;
        var cb = fwdq[fwdix].cb;
        var pm = [];
        var ret;
        var target = '';
        if ( task.length == 0 ){
            fwdq[fwdix].status = 'ok';
            target = body.target;
            ret = {"DDN":"","Reply":{}};
            ret.Reply = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"Target":target,"By":MyMMA};
            reply.push(ret);
            if ( typeof cb == 'function' ) cb(ret);
            EndFwdTask(fwdix);
            return;
        }
        var x = 0;
        var dcinfo;
        for ( var i = 0; i < task.length; i++ ){
            if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting task%d=%s', i, JSON.stringify(task[i]));
            dcinfo = task[i].dcinfo;
            target = task[i].target;
            if ( dcinfo.length == 0 ) {
                if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting no dcinfo=%s', JSON.stringify(task[i]));
                pm[x] = new Promise(function(resolve, reject){
                    var rmsg = {"DDN":"","Reply":{}};
                    rmsg.Reply = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"Target":target,"By":MyMMA};
                    resolve(rmsg);
                }).then(function(result){
                    if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                    reply.push(result);
                }).catch(function(reason){
                    console.log('session:DoFwdXrpcRouting catch=%s', reason);
                    var rmsg = {"DDN":"","Reply":{}};
                    rmsg.Reply = {"ErrCode":err.SS_ERROR_SendError,"ErrMsg":err.SS_ERROR_SendError_Msg,"Reason":reason,"Target":target,"By":MyMMA};
                    reply.push(rmsg);
                });
                x += 1;
            }
            else {
                if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting dcinfo=%s', JSON.stringify(dcinfo));
                for ( var j = 0; j < dcinfo.length; j++ ){
                    if ( dcinfo[j].dc != '' ){
                        pm[x] = new Promise(function(resolve, reject){
                            var umma, udata, DcMMA, nbody, ddn;
                            //target = dcinfo[j].key;
                            if ( dcinfo[j].dc == 'local' ){
                                umma = dcinfo[j].mma;
                                ddn = dcinfo[j].DDN;
                                if ( typeof data.in == 'object')
                                    udata = {"in":data.in,"ddn":ddn,"data":data.data};
                                else
                                    udata = {"ddn":ddn,"data":data};
                                if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting mma=%s data=%s',umma, JSON.stringify(udata));
                                ins.CallXrpc(umma, ufunc, udata, function(result){
                                    if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                                    //resolve({"DDN":ddn,"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg});
                                    //resolve(result);
                                    resolve({"DDN":ddn,"Reply":result});
                                });
                            }
                            else {
                                DcMMA = dcinfo[j].dc;
                                nbody = {"stoken":body.stoken,"target":dcinfo[j].DDN,"func":body.func,"data":body.data};
                                if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting DC mma=%s, body=%s', DcMMA, JSON.stringify(nbody));
                                ins.CallXrpc(DcMMA, 'callto', nbody, function(result){
                                    if ( sdbg >= 2 ) console.log('Session:DoFwdXrpcRouting DC result=%s', JSON.stringify(result));
                                    //resolve({"target":target,"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg});
                                    resolve(result);
                                    //resolve({"DC":DcMMA,"Reply":result});
                                });
                            }
                        }).then(function(result){
                            if ( sdbg >= 2 ) console.log('session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                            reply.push(result);
                        }).catch(function(reason){
                            console.log('session:DoFwdXrpcRouting catch=%s', reason);
                            var rmsg = {"DDN":"","Reply":{}};
                            rmsg.Reply = {"ErrCode":err.SS_ERROR_SendError,"ErrMsg":err.SS_ERROR_SendError_Msg,"Reason":reason,"Target":target,"By":MyMMA};
                            reply.push(rmsg);
                        });
                        x += 1;
                    }
                    else {
                        pm[x] = new Promise(function(resolve, reject){
                            var rmsg = {"DDN":"","Reply":{}};
                            rmsg.Reply = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"Target":target,"By":MyMMA};
                            resolve(rmsg);
                        }).then(function(result){
                            if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                            reply.push(result);
                        }).catch(function(reason){
                            console.log('session:DoFwdXrpcRouting catch=%s', reason);
                            var rmsg = {"DDN":"","Reply":{}};
                            rmsg.Reply = {"ErrCode":err.SS_ERROR_SendError,"ErrMsg":err.SS_ERROR_SendError_Msg,"Reason":reason,"Target":target,"By":MyMMA};
                            reply.push(rmsg);
                        });
                        x += 1;
                    }
                }
            }   
        }
        if ( pm.length > 0 ){
            Promise.all(pm).then(function(){
                fwdq[fwdix].status = 'ok';
                if ( typeof cb == 'function' ) {
                    //if ( sdbg >= 1 ) console.log('session:DoFwdXrpcRouting reply=%s', JSON.stringify(reply));
                    if ( reply.length == 1 ) cb(reply[0]);
                    else cb(reply);
                }
                if ( sdbg >= 2 ) {
                    console.log('session:DoFwdXrpcRouting reply=%s', JSON.stringify(reply));
                    console.log('session:DoFwdXrpcRouting end=%s', JSON.stringify(fwdq[fwdix]));
                }
                EndFwdTask(fwdix);
            });
        }
        else {
            if ( typeof cb == 'function' ) cb( reply );
            EndFwdTask(fwdix);
        }
    }
    catch(err){
        console.log('session:DoFwdXrpcRouting error=%s', err.message);
        ret = {"DDN":"","Reply":{}};
        ret.Reply = {"ErrCode":err.SS_ERRCODE,"ErrMsg":err.message,"Target":target,"By":MyMMA};
        reply.push(ret);
        if ( typeof cb == 'function' ) cb(ret);
        EndFwdTask(fwdix);
    }
    
}

var DoFwdXmsgRouting = function(fwdix){
    try {
        var body = fwdq[fwdix].body;
        var data = body.data;
        var ufunc = body.func;
        var task = fwdq[fwdix].task;
        var reply = fwdq[fwdix].reply;
        var cb = fwdq[fwdix].cb;
        var pm = [];
        var ret;
        var target = '';
        //if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting task=%s', JSON.stringify(task));
        if ( task.length == 0 ){
            fwdq[fwdix].status = 'ok';
            ret = {"DDN":"","Reply":{}};
            ret.Reply = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"Target":target,"By":MyMMA};
            if ( typeof cb == 'function' ) cb(ret);
            EndFwdTask(fwdix);
            return;
        }
        var x = 0;
        var dcinfo;
        
        for ( var i = 0; i < task.length; i++ ){
            dcinfo = task[i].dcinfo;
            target = task[i].target;
            if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting task=%s', JSON.stringify(task[i]));
            if ( dcinfo.length == 0 ) {
                if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting no dcinfo=%s', JSON.stringify(task[i]));
                pm[x] = new Promise(function(resolve, reject){
                    var rmsg = {"DDN":"","Reply":{}};
                    rmsg.Reply = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"Target":target,"By":MyMMA};
                    resolve(rmsg);
                }).then(function(result){
                    if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting result=%s', JSON.stringify(result));
                    reply.push(result);
                }).catch(function(reason){
                    console.log('session:DoFwdXmsgRouting catch=%s', reason);
                    var rmsg = {"DDN":"","Reply":{}};
                    rmsg.Reply = {"ErrCode":err.SS_ERROR_SendError,"ErrMsg":err.SS_ERROR_SendError_Msg,"Reason":reason,"Target":target,"By":MyMMA};
                    reply.push(rmsg);
                });
                x += 1;
            }
            else {
                if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting dcinfo=%s', JSON.stringify(dcinfo));
                for ( var j = 0; j < dcinfo.length; j++ ){
                    if ( dcinfo[j].dc != '' ){
                        pm[x] = new Promise(function(resolve, reject){
                            var umma, nbody, DcMMA, ddn;
                            //target = dcinfo[j].key;
                            if ( dcinfo[j].dc == 'local' ){
                                umma = dcinfo[j].mma;
                                ddn = dcinfo[j].DDN;
                                var nbody = {"stoken":body.stoken,"ddn":ddn,"in":body.in,"data":body.data};
                                if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting mma=%s data=%s',umma, JSON.stringify(nbody));
                                ins.SendXmsg( umma, nbody, [], WaitReplyTimeout, function(result){
                                    if ( sdbg >= 2 ) console.log('session:DoFwdXmsgRouting result=%s', JSON.stringify(result));
                                    //console.log('Session:DoFwdXmsgRouting sendxmsg result=%s', JSON.stringify(result));
                                    //resolve(result.body);
                                    resolve({"DDN":ddn,"Reply":result.body});
                                });
                            }
                            else {
                                DcMMA = dcinfo[j].dc;
                                nbody = {"stoken":body.stoken,"target":dcinfo[j].DDN,"in":body.in,"data":body.data};
                                if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting DC mma=%s data=%s',DcMMA, JSON.stringify(nbody));
                                ins.CallXrpc(DcMMA, 'sendto', nbody, function(result){
                                    if ( sdbg >= 2 ) console.log('session:DoFwdXmsgRouting DC result=%s', JSON.stringify(result));
                                    //console.log('Session:DoFwdXrpcRouting result=%s', JSON.stringify(result));
                                    resolve(result);
                                    //resolve({"DDN":DcMMA,"Reply":result});
                                });
                            }
                        }).then(function(result){
                            if ( sdbg >= 2 ) console.log('session:DoFwdXmsgRouting result=%s', JSON.stringify(result));
                            reply.push(result);
                            //reply.push({"target":target,"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"reply":result});
                        }).catch(function(reason){
                            console.log('session:DoFwdXmsgRouting catch=%s', reason);
                            var rmsg = {"DDN":"","Reply":{}};
                            rmsg.Reply = {"ErrCode":err.SS_ERROR_SendError,"ErrMsg":err.SS_ERROR_SendError_Msg,"Reason":reason,"Target":target,"By":MyMMA};
                            reply.push(rmsg);
                        });
                        x += 1;       
                    }
                    else {
                        pm[x] = new Promise(function(resolve, reject){
                            var rmsg = {"DDN":"","Reply":{}};
                            rmsg.Reply = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"Target":target,"By":MyMMA};
                            resolve(rmsg);
                        }).then(function(result){
                            if ( sdbg >= 2 ) console.log('session:DoFwdXmsgRouting result=%s', JSON.stringify(result));
                            reply.push(result);
                        }).catch(function(reason){
                            console.log('session:DoFwdXmsgRouting catch=%s', reason);
                            var rmsg = {"DDN":"","Reply":{}};
                            rmsg.Reply = {"ErrCode":err.SS_ERROR_SendError,"ErrMsg":err.SS_ERROR_SendError_Msg,"Reason":reason,"Target":target,"By":MyMMA};
                            reply.push(rmsg);
                        });
                        x += 1;
                    }
                }
            }
        }
        if ( pm.length > 0 ){
            Promise.all(pm).then(function(){
                fwdq[fwdix].status = 'ok';
                if ( typeof cb == 'function' ) {
                    if ( sdbg >= 1 ) console.log('session:DoFwdXmsgRouting reply=%s', JSON.stringify(reply));
                    //console.log('session:DoFwdXmsgRouting: typeof cb=%s', typeof cb);
                    if ( typeof cb == 'function' ){
                        if ( reply.length == 1 ) cb(reply[0]);
                        else cb(reply);
                    }
                }
                EndFwdTask(fwdix);
            });
        }
        else {
            if ( typeof cb == 'function' ) cb(reply);
            EndFwdTask(fwdix);
        }
    }
    catch(err){
        console.log('session:DoFwdXmsgRouting error=%s', err.message);
        if ( typeof cb == 'function' ) {
            ret = {"DDN":"","Reply":{}};
            ret.Reply = {"ErrCode":err.SS_ERRCODE,"ErrMsg":err.message,"Target":target,"By":MyMMA};
            if ( typeof cb == 'function' ) cb(ret);
        }
        //EndFwdTask(fwdix);
    }
}

var SearchLocalTarget = function(method, fwdix){
    var app, task;
    var bret;
    if ( sdbg >= 1 ) console.log('Session:SearchLocalTarget method=%s,task=%s', method, JSON.stringify(fwdq[fwdix].task));
    task = fwdq[fwdix].task;
    if ( task.length > 0 ) {
        bret = ChkMatchedSession(method, task);
        if ( sdbg >= 1 ) console.log('Session:SearchLocalTarget match task=%d %s', fwdq[fwdix].task.length, JSON.stringify(fwdq[fwdix].task));
        return bret;
    }
    return false;
}

var SearchRemoteTarget = function(method, fwdix, next){
    var devix = fwdq[fwdix].regix;
    var EiMMA = regtable[devix].EiMMA;
    var SToken = regtable[devix].SToken;
    var task = fwdq[fwdix].task;
    var pm = [];
    var x = 0;
    if ( task.length > 0 ){
        for ( var i = 0; i < task.length; i++ ){
            var otask;
            otask = task[i];
            if ( otask.dcinfo.length == 0 || otask.mode == 'group' ){
                pm[x] = new Promise(function(resolve, reject){
                    var key, deq;
                    key = otask.target;
                    deq = otask.dcinfo;
                    SearchEi(EiMMA, SToken, key, function(reply){
                        if ( sdbg >= 1 ) console.log('session:SearchRemoteTarget:SearchEi reply=%s', JSON.stringify(reply));
                        if ( typeof reply.ErrCode == 'undefined' ){
                            if ( reply.length > 0 ){
                                for ( var k = 0; k < reply.length; k++ ){
                                    DcUDID = reply[k].DcUDID;
                                    if ( DcUDID != MyUDID){
                                        DcMMA = reply[k].DcMMA2;
                                        var dcinfo = {"key":reply[k].EiName,"dc":DcMMA,"mma":reply[k].EiMMA,"DDN":reply[k].DDN};
                                        AddEiList(deq, dcinfo);
                                    }
                                }
                                //if ( k == reply.length ) resolve('OK');
                                resolve('OK');
                            }
                            else resolve('no matched');
                        }
                        else resolve(reply.ErrMsg);
                    });
                }).then(function(result){
                    if ( sdbg >= 2 ) console.log('session:SearchRemoteTarget result=%s', JSON.stringify(result));
                    //otask.dcinfo.push(result);
                }).catch(function(reason){
                    console.log('session:SearchRemoteTarget catch=%s', reason);
                });
                x += 1; 
            }    
        }
        if ( pm.length > 0 ){
            Promise.all(pm).then(function(){
                if ( sdbg >= 1 ) console.log('Session:SearchRemoteTarget match task=%d %s', fwdq[fwdix].task.length, JSON.stringify(fwdq[fwdix].task));
                if ( typeof next == 'function' ) next(method, fwdix);
            });
        }
        else {
            if ( typeof next == 'function' ) next(method, fwdix);
        }
    }
    else {
        if ( typeof next == 'function') next(method, fwdix); 
    }
}

var CreateTicket =function(len) {
    var text = "";
    //var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < len; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

exports.CallXrpc = function(head, body, cb){
    var target = '';
    var func = '';
    var data;
    var ret;
    console.log('Session:CallXrpc body=%s', JSON.stringify(body));
    if ( typeof body.target == 'string' ) target = body.target;
    if ( typeof body.func == 'string' ) func = body.func;
    if ( typeof body.data != 'undefined' ) data = body.data;
    if ( target != '' && func != '' && data != null ){
        // find mma at local
        var mma = SearchInfoList('xrpc', 'ddn', target);
        //if ( sdbg >= 1 ) console.log('Session:CallXrpc mma=%s', JSON.stringify(mma));
        if ( mma.length > 0 ){
            var umma, ddn;
            //umma = GetRouteMMA(mma[0].EiUMMA, mma[0].EiUDID);
            umma = mma[0].MMA;
            ddn = mma[0].DDN;
            //var ufunc = 'sec' + body.func;
            var nbody = {"ddn":ddn,"data":data};
            if ( sdbg >= 1 ) console.log('Session:CallXrpc: local mma=%s, func=%s, data=%s', umma, func, JSON.stringify(nbody));
            //CallMultiXrpc(umma, ufunc, udata, cb);
            ins.CallXrpc(umma, func, nbody, function(reply){
                if ( sdbg >= 1 ) console.log('Session:CallXrpc: reply=%s', JSON.stringify(reply));
                if ( typeof cb == 'function' ) {
                    cb({"DDN":ddn,"Reply":reply});
                }
            });
        }
        else {
            if ( typeof cb == 'function' ){
                ret = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"By":MyMMA};
                cb(ret);
            }
        }
    }
    else {
        if ( typeof cb == 'function' ){
            ret = {"ErrCode":err.SS_ERROR_InvalidData,"ErrMsg":err.SS_ERROR_InvalidData_Msg,"By":MyMMA};
            cb(ret);
        }
    }
}

exports.CallXmsg = function(head, body, cb){
    var stoken = '';
    var target = '';
    var data;
    console.log('Session:CallXmsg body=%s', JSON.stringify(body));
    if ( typeof body.stoken == 'string' ) stoken = body.stoken;
    if ( typeof body.target == 'string' ) target = body.target;
    if ( typeof body.data != 'undefined' ) data = body.data;
    if ( target != '' && data != null ){
        var mma = SearchInfoList('xmsg', 'ddn', target);
        var umma, ddn;
        //if ( sdbg >= 1 ) console.log('Session:CallXmsg: target=%s,mma=%s', target, JSON.stringify(mma));
        if ( mma.length > 0 ){
            //umma = mma[0].EiUMMA + ':' + mma[0].EiUPort;
            //umma = GetRouteMMA(mma[0].EiUMMA, mma[0].EiUDID);
            umma = mma[0].MMA;
            ddn = mma[0].DDN;
            var nbody = {"stoken":stoken,"ddn":ddn,"in":body.in,"data":body.data};
            if ( sdbg >= 1 ) console.log('Session:CallXmsg: local mma=%s, data=%s', umma, JSON.stringify(nbody));
            ins.SendXmsg( umma, nbody, [], WaitReplyTimeout, function(result){
                if ( sdbg >= 1 ) console.log('Session:CallXmsg: local result=%s', JSON.stringify(result));
                if ( typeof cb == 'function' ) {
                    if ( typeof result.body != 'undefined' )
                        cb({"DDN":ddn,"Reply":result.body});
                    else
                        cb({"DDN":ddn,"Reply":result});
                }
            });
        }
        else {
            if ( typeof cb == 'function' ){
                ret = {"ErrCode":err.SS_ERROR_TargetNotFound,"ErrMsg":err.SS_ERROR_TargetNotFound_Msg,"By":MyMMA};
                cb(ret);
            }
        }
    }
    else {
        if ( typeof cb == 'function' ){
            ret = {"ErrCode":err.SS_ERROR_InvalidData,"ErrMsg":err.SS_ERROR_InvalidData_Msg,"By":MyMMA};
            cb(ret);
        }
    }
}

exports.ChkSToken = function(stoken){
    return GetInfo(stoken);    
}

var SearchEi = function(EiMMA, SToken, Key, cb){
    if ( sdbg >= 1 ) console.log('Session:SearchEi Key=%s', Key);
    if ( Key == '' ){
        if ( typeof cb == 'function' ) cb([]);
        return;
    }
    ins.CallXrpc(ucmma, 'eiSearch', [EiMMA,SToken,Key], function(reply){
        if ( sdbg >= 1 ) console.log('Session:SearchEi Search:reply=%s', JSON.stringify(reply));
        var nreply = [];
        if ( typeof reply.ErrCode == 'undefined' ){
            if ( reply.length > 0 ){
                var ei, dcMMA;
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
            if ( ei.DDN == list[i].DDN ) break;
        }
        if ( i == list.length ){
            list.push(ei);
            return true;
        }
    }
    return false;
}

/*
var GetRouteMMA = function(umma, udid){
    var rmma;
    rmma = umma.substr(0, umma.indexOf('@')+1) + udid;
    //console.log('session:GetRouteMMA mma=%s', rmma);
    return rmma;
}
*/

var NewInfo = function(){
    var info = {"AppKey":"","EiToken":"","SToken":"","EiUMMA":"","EiUPort":"",
    "EiUDID":"","EiMMA":"","WIP":"","LIP":"","DDN":"","AppId":"","UToken":"","State":"",
    "EiOwner":"","EiName":"","EiType":"","EiTag":"","EiLoc":"","TimeStamp":new Date()};
    return info;
}

var AddSessionInfo = function(SToken, AppKey, EiUMMA, EiUPort, WIP, LIP, ei, cb){
    //console.log('AddInfo: reginfo=%s', JSON.stringify(reginfo));
    var ix = GetInfo(SToken);
    var reginfo;
    if ( ix < 0 ){
        reginfo = NewInfo();
    }
    else {
        reginfo = regtable[ix];
    }
    reginfo.AppKey = AppKey;
    reginfo.EiUMMA = EiUMMA;
    reginfo.EiUPort = EiUPort;
    reginfo.WIP = WIP;
    reginfo.LIP = LIP;
    reginfo.EiToken = ei.EiToken;
    reginfo.SToken = ei.SToken;
    reginfo.UToken = ei.UToken;
    reginfo.EiUDID = ei.EiUDID;
    reginfo.EiMMA = ei.EiMMA;
    reginfo.DDN = ei.DDN;
    reginfo.AppId = ei.AppId;
    if ( typeof ei.EdgeInfo == 'object'){
        reginfo.EiOwner = ei.EdgeInfo.EiOwner;
        reginfo.EiName = ei.EdgeInfo.EiName;
        reginfo.EiType = ei.EdgeInfo.EiType;
        reginfo.EiTag = ei.EdgeInfo.EiTag;
        reginfo.EiLoc = ei.EdgeInfo.EiLoc;
    }
    reginfo.State = 'reg'
    if ( ix < 0 ) regtable.push(reginfo);
    if ( typeof cb == 'function' ) cb({"ErrCode":err.SS_OKCODE,"ErrMsg":err.SS_OKMSG,"result":reginfo});
}

var AddMyDeviceInfo = function(devinfo){
    try {
        var ix = GetInfoByDDN(devinfo.DDN);
        if ( ix >= 0 ){
            regtable[ix].EiName = devinfo.EiName;
            regtable[ix].EiType = devinfo.EiType;
            regtable[ix].EiTag = devinfo.EiTag;
            regtable[ix].EiLoc = devinfo.EiLoc;
        }
        if ( sdbg >= 2 ) console.log('AddMyDeviceInfo: regtable=%s', JSON.stringify(regtable));
        return ix;
    }
    catch(err){
        console.log('session:AddMyDeviceInfo: error=%s', err.message);
    }
    return -1;
}

var AddDeviceInfo = function(stoken, devinfo){
    //console.log('AddInfo: reginfo=%s', JSON.stringify(reginfo));
    if ( stoken != '' ){
        var ix = GetInfo(stoken);
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

var RmInfo = function(skey){
    if ( sdbg >= 1 ) console.log('RmInfo: skey=%s', skey);
    if ( skey != '' ){
        var ix = GetInfo(skey);
        if ( ix >= 0 && regtable[ix].State == 'unreg' ){
            regtable.splice(ix, 1);
            if ( sdbg >= 2 ) console.log('RmInfo: regtable=%s', JSON.stringify(regtable));
        }
    }    
}

var ChkMatchedSession = function(method, task){
    var target, atype;
    var found, owner, ddn, dname, dtype, dtag, umma;
    var bret = false;
    if ( task.length > 0 ){
        for ( var i = 0; i < task.length; i++ ){
            atype = task[i].search; 
            target = task[i].target;
            if ( sdbg >= 1 ) console.log('session:ChkMatchedSession: search=%s,target=%s', atype, target);
            for ( var k = 0; k < regtable.length; k++ ){
                found = false;
                if ( atype == 'app' ){
                    if ( regtable[k].AppId.indexOf(target) >= 0 ) found = true;
                }
                else if ( atype == 'udid' ){
                    if ( target == regtable[k].EiUDID ) found = true;
                }
                else if ( atype == 'dev' ){
                    //console.log('session.ChkMatchedSession: regtable%d=%s', k, JSON.stringify(regtable[k]));
                    owner = regtable[k].EiOwner;
                    if ( owner != null && owner != '' ){
                        if ( owner == target ) found = true;
                    }
                    ddn = regtable[k].DDN;
                    if ( ddn != null && ddn != '' ){
                        if ( ddn == target ) found = true;
                    }
                    dname = regtable[k].EiName;
                    if ( dname != null && dname != '' ){
                        dname = dname.toLowerCase();
                        if ( dname == target.toLowerCase() ) found = true;
                    }
                    dtype = regtable[k].EiType;
                    if ( dtype != null && dtype != '' ){
                        dtype = dtype.toLowerCase();
                        if ( dtype == target.toLowerCase() ) found = true;
                    }
                    dtag = regtable[k].EiTag;
                    if ( dtag != null && dtag != '' ){
                        dtag = dtag.toLowerCase();
                        if ( dtag == target.toLowerCase() ) found = true;
                    }
                    umma = regtable[k].EiUMMA;
                    if ( umma != null && umma != '' ){
                        umma = umma.toLowerCase();
                        if ( umma == target.toLowerCase() ) found = true;
                    }
                }
                if ( found ){
                    bret = true;
                    var umma;
                    if ( sdbg >= 1 ) console.log('session:ChkMatchedSession ei=%s', JSON.stringify(regtable[k]));
                    umma = BuildMMA(method, k);
                    if ( umma != '' ){
                        var dcinfo = {"dc":"local","mma":umma,"DDN":regtable[k].DDN};
                        task[i].dcinfo.push(dcinfo);
                    }
                }
            } 
        } 
    }
    if ( sdbg >= 2 ) console.log('session:ChkMatchedSession: task=%s', JSON.stringify(task));
    return bret;
}

// SearchInfoList: Get information list of session table by key
// method: protocal method: 'xmsg' or 'xrpc'
// stype: have 'all' and 'udid'
// skey: keyword of device
var SearchInfoList = function(method, stype, skey){
    var atype = stype;
    var reglist = [];
    var mma;
    if ( sdbg >= 2 ) console.log('SearchInfoList regtable=%s', JSON.stringify(regtable));
    if ( atype != '' ) {
        atype = atype.toLowerCase();
        if ( atype == 'all' ) reglist = regtable;
        else if ( atype == 'ddn' ) {
            if ( skey != '' ){
                for ( var i = regtable.length-1; i >= 0; i-- ){
                    if ( skey == regtable[i].DDN ){
                        //reglist.push(regtable[i]);
                        //reglist.push({"EiUDID":regtable[i].EiUDID,"EiUMMA":regtable[i].EiUMMA,"EiUPort":regtable[i].EiUPort,"DDN":regtable[i].DDN});
                        mma = BuildMMA(method, i);
                        if ( mma != '' ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN});
                    }
                }
            }
        }
        else if ( atype == 'app' ) {
            if ( skey != '' ){
                for ( var i = regtable.length-1; i >= 0; i-- ){
                    if ( skey == regtable[i].AppId ){
                        //reglist.push(regtable[i]);
                        //reglist.push({"EiUDID":regtable[i].EiUDID,"EiUMMA":regtable[i].EiUMMA,"EiUPort":regtable[i].EiUPort,"DDN":regtable[i].DDN});
                        mma = BuildMMA(method, i);
                        if ( mma != '' ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN});
                    }
                }
            }
        }
        else if ( atype == 'udid' ) {
            if ( skey != '' ){
                for ( var i = regtable.length-1; i >= 0; i-- ){
                    if ( skey == regtable[i].EiUDID ){
                        //reglist.push(regtable[i]);
                        //reglist.push({"EiUDID":regtable[i].EiUDID,"EiUMMA":regtable[i].EiUMMA,"EiUPort":regtable[i].EiUPort,"DDN":regtable[i].DDN});
                        mma = BuildMMA(method, i);
                        if ( mma != '' ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN});
                    }
                }
            }
        }
        else if ( atype == 'umma' ) {
            var akey = skey;
            var umma;
            if ( akey != '' ) {
                akey = akey.toLowerCase();
                for ( var i = regtable.length-1; i >= 0; i-- ){
                    umma = regtable[i].EiUMMA;
                    if ( umma != '' ){
                        umma = umma.toLowerCase();
                        if ( akey == umma || akey == umma.substr(0, umma.indexOf('@')) ){
                            //reglist.push({"EiUDID":regtable[i].EiUDID,"EiUMMA":regtable[i].EiUMMA,"EiUPort":regtable[i].EiUPort,"DDN":regtable[i].DDN});
                            mma = BuildMMA(method, i);
                            if ( mma != '' ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN});
                        }
                    }
                }
            }
        }
        else if ( atype == 'dev' ){
            var akey = skey;
            var owner, dname, dtype, dtag;
            if ( akey != '' ) {
                akey = akey.toLowerCase();
                for ( var i = regtable.length-1; i >= 0; i-- ){
                    owner = (typeof regtable[i].EiOwner != null ) ? regtable[i].EiOnwer : '';
                    if ( owner != null && owner != '' ){
                        //owner = owner.toLowerCase();
                        if ( owner == akey ){
                            mma = BuildMMA(method, i);
                            if ( mma != '' ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN});
                            continue;
                        }
                    }
                    dname = (typeof regtable[i].EiName != null ) ? regtable[i].EiName : '';
                    if ( dname != null && dname != '' ){
                        dname = dname.toLowerCase();
                        if ( dname == akey ){
                            mma = BuildMMA(method, i);
                            if ( mma != '' ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN});
                            continue;
                        }
                    }
                    dtype = (typeof regtable[i].EiType != null ) ? regtable[i].EiType : '';
                    if ( dtype != null && dtype != '' ){
                        dtype = dtype.toLowerCase();
                        if ( dtype == akey ){
                            mma = BuildMMA(method, i);
                            if ( mma != '' ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN});
                            continue;
                        }
                    }
                    dtag = (typeof regtable[i].EiTag != null ) ? regtable[i].EiTag : '';
                    if ( dtag != null && dtag != '' ){
                        dtag = dtag.toLowerCase();
                        if ( dtag == akey ){
                            mma = BuildMMA(method, i);
                            if ( mma != '' ) reglist.push({"MMA":mma,"DDN":regtable[i].DDN});
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
            /*
            if ( umma.indexOf(';') > 0)
                umma = umma.substr(0, umma.indexOf(';'));
            if ( regtable[k].WIP != '' ){
                var wip = regtable[k].WIP;
                umma = umma.substr(0, umma.indexOf('@')+1 ) + wip;
            }
            umma += ':' + regtable[k].EiUPort;
            */
        }
    }
    return umma;
}


// GetInfo: Get information of session table
// skey: SToken of session
var GetInfo = function(skey){
    var index = -1;
    if ( typeof skey == 'string' && skey != '' ){
        for ( var i = 0; i < regtable.length; i++ ){
            if ( skey == regtable[i].SToken ){
                index = i;
                break;
            }
        }
    }
    return index; 
}

var GetInfoByDDN = function(skey){
    var index = -1;
    if ( typeof skey == 'string' && skey != '' ){
        for ( var i = 0; i < regtable.length; i++ ){
            if ( skey == regtable[i].DDN ){
                index = i;
                break;
            }
        }
    }
    return index; 
}

var GetInfoByUDID = function(udid, cb){
    //console.log('GetInfoByUDID UDID=%s', udid );
    var retss = [];
    if ( typeof udid == 'string' && udid != '' ){
        for ( var i = 0; i < regtable.length; i++ ){
            if ( udid == regtable[i].EiUDID ){
                var ss = {"EiMMA":regtable[i].EiMMA,"SToken":regtable[i].SToken};
                retss.push(ss);
            }
        }
    }
    if ( typeof cb == 'function' ) cb(retss);
}

var GetInfoByMMA = function(EiUMMA, cb){
    //console.log('GetInfoByMMA EiUMMA=%s', EiUMMA );
    var retss = [];
    if ( typeof EiUMMA == 'string' && EiUMMA != '' ){
        for ( var i = 0; i < regtable.length; i++ ){
            //console.log('GetInfoByMMA regitem=%s', JSON.stringify(regtable[i]));
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
                console.log('WatchIdleSession elapse edge=%s', regtable[i].EiMMA);
                SToken = regtable[i].SToken;
                EiMMA = regtable[i].EiMMA;
                EndSession(EiMMA, SToken, function(result){
                    //console.log('WatchIdleSession:EndSession SToken=%s result=%s',SToken, JSON.stringify(result));
                });
            }
        }
    }
}






