// appmain: module for main
// Date: 2019/04/29
// Version: 1.4.2
// Update: mlog module, add conf.Log = true|false

var exports = module.exports = {};
var inet;
var ucmma;
var appname;
var updc = [];
var session;
var amerr;
var adbg = 1;
var ver = '1.4.2';
var vertime = '2019/04/29';

exports.Start = function( conf, mlog ){
    console.log('dc start: version=%s updatetime=%s', ver, vertime);
    amerr = require('./sserr');
    //console.log('chk err=%s', amerr.SS_OKMSG);
    ucmma = conf.UCenter;
    appname = conf.AppName;
    inet = require('./in');
    inet.Open(conf, mlog, function(result){
        console.log('Start result=%s', JSON.stringify(result) );
        if ( result.ErrCode == amerr.SS_OKCODE ){
            session = require('./session');
            session.Open(conf, XmsgRcve, XrpcDcService, XrpcDcSecService, inet, mlog, function(result){
                if ( result ) snState = 'ready';
            });
        }
        else console.log('Start error=%s', result.ErrMsg);
    });
}

var XmsgRcve = function(ptype, head, body){
    console.log("XmsgRcve: head=%s", head.from);
    if (adbg >= 0) console.log("XmsgRcve: body=%s", JSON.stringify(body));
    if ( InTraceProc(body) ) {
        //console.log("XmsgRcve: body2=%s", JSON.stringify(body));
        session.RouteXmsg(head, body, function(result){
            if (adbg >= 1) console.log('RouteXmsg result=%s', JSON.stringify(result));
            if ( result[0] ) InTraceResp(result[0].Reply);
            inet.ReplyXmsg(head, result, null, 0);
        });
    };
}

var InTraceProc = function(body){
    try {
        var indata = body.data;
        var cmd = indata.cmd;
        var ddn = body.to ? (body.to.DDN ? body.to.DDN : '') : '';
        //if ( cmd ) cmd = cmd.toLowerCase();
        if ( cmd == 'trace' && ddn != 'dc' ){
            var trace = indata.trace;
            var trdata = inet.GetTraceData();
            //console.log("XmsgRcve: trdata=%s", JSON.stringify(trdata));
            trace.push(trdata);
        }
        return true;
    }
    catch(e){
        console.log("InTraceProc error:%s", e.message);
        return false;
    }
}

var InTraceResp = function(reply){
    try {
        var resp = reply.response;
        if ( resp == 'trace' ){
            var trace = reply.Trace;
            var trdata = inet.GetTraceData();
            //console.log("XmsgRcve: trdata=%s", JSON.stringify(trdata));
            trace.push(trdata);
            return true;
        }
    }
    catch(e){
        console.log("InTraceResp error:%s", e.message);
    }
    return false;
}

var XrpcDcService = {
    "reg": function(head, body){
        console.log('reg: from:%s', head.from);
        if ( typeof body == 'object' ){
            //console.log("reg: head=%s", JSON.stringify(head));
            //console.log("reg: body=%s", JSON.stringify(body));
            var EiUDID, EiMMA, WIP, LIP, AppKey, EiToken, SToken, EiUMMA, EiUPort;
            EiUDID = head.by;
            EiMMA = head.from;
            AppKey = body.AppKey;
            EiToken = body.EiToken;
            SToken = body.SToken;
            EiUMMA = body.EiUMMA;
            EiUPort = body.EiUPort;
            if ( body.WIP ) WIP = body.WIP;
            else WIP = '';
            if ( body.LIP ) LIP = body.LIP;
            else LIP = '';
            if ( adbg >= 0 ) console.log('reg: para: %s,%s,%s,%s,%s',SToken,EiToken,EiUMMA,WIP,LIP);
            if ( adbg >= 1 ) console.log('reg: para: EiUDID=%s,EiMMA=%s,WIP=%s,LIP=%s,AppKey=%s,EiToken=%s,SToken=%s',EiUDID,EiMMA,WIP,LIP,AppKey,EiToken,SToken);
            return new Promise(function(resolve) {
                // do a thing, possibly async, then…
                session.StartSession(EiUDID, EiMMA, WIP, LIP, AppKey, EiToken, SToken, EiUMMA, EiUPort, function(result){
                    if (adbg >= 1) console.log("reg: return=%s", JSON.stringify(result));
                    resolve(result);
                });
            })
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "unreg": function(head, body){
        console.log('unreg: from:%s', head.from);
        if ( typeof body == 'object' ){
            if (adbg >= 1) console.log("unreg: body=%s", JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                if (adbg >= 1) console.log('unreg: EiMMA=%s,SToken=%s',EiMMA, SToken);
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    session.EndSession(EiMMA, SToken, function(result){
                        resolve(result);
                    });
                })
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};     
            }
            //return {"ErrCode":MAIN_OKCODE,"ErrMsg":MAIN_OKMSG};
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "resetreg": function(head, body){
        console.log('resetreg: from:%s', head.from);
        if (adbg >= 2) console.log("resetreg: head=%s", JSON.stringify(head));
        if (adbg >= 1) console.log("resetreg: body=%s", JSON.stringify(body));
        var frmma = head.from;
        var udid = head.by;
        var mma = body.EiUMMA;
        return new Promise(function(resolve) {
            // do a thing, possibly async, then…
            session.ResetSession(udid, frmma, mma, function(result){
                if (adbg >= 1) console.log("resetreg: return=%s", JSON.stringify(result));
                resolve(result);
            });
        })
    },
    "getinfo": function(head, body){
        if ( typeof body == 'object' ){
            //console.log("getinfo body=%s", JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('getinfo: EiMMA=%s,SToken=%s',EiMMA,SToken);
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    inet.CallXrpc(ucmma, 'eiGetEdgeInfo', [ EiMMA, SToken ], null, null, function(result){
                        //console.log('xrpc getinfo result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else {
                            if ( result.ErrCode == 0 )
                            session.AddDeviceInfo(SToken, result.result);
                            resolve(result); 
                        }
                    });
                })
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};
            }
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "setinfo": function(head, body){
        if ( typeof body == 'object' ){
            //console.log("setinfo body=%s", JSON.stringify(body));
            var EiMMA, SToken, EdgeInfo;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            EdgeInfo = body.EdgeInfo;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('setinfo: EiMMA=%s,SToken=%s,EdgeInfo=%s',EiMMA,SToken,JSON.stringify(EdgeInfo));
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    inet.CallXrpc(ucmma, 'eiSetEdgeInfo', [ EiMMA, SToken, EdgeInfo ], null, null, function(result){
                        //console.log('xrpc setinfo result=%s', JSON.stringify(result));
                        if ( result == true ){
                            session.AddDeviceInfo(SToken, EdgeInfo);
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG});
                        }
                        else {
                            resolve({"ErrCode":amerr.SS_ERROR_SetDeviceInfoError,"ErrMsg":amerr.SS_ERROR_SetDeviceInfoError_Msg});
                        }
                    });
                })
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};
            }
            //return {"ErrCode":MAIN_OKCODE,"ErrMsg":MAIN_OKMSG};
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "getapp": function(head, body){
        if ( typeof body == 'object' ){
            if (adbg >= 1) console.log("getapp: body=%s", JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                if (adbg >= 1) console.log('getapp: EiMMA=%s,SToken=%s',EiMMA,SToken);
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    //console.log('getapp mma=%s', ucmma);
                    inet.CallXrpc(ucmma, 'eiGetAppSetting', [ EiMMA, SToken ], null, null, function(result){
                        if (adbg >= 1) console.log('xrpc getapp result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result); 
                    });
                })
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};
            }
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "setapp": function(head, body){
        if ( typeof body == 'object' ){
            //console.log("setapp: body=%s", JSON.stringify(body));
            var EiMMA, SToken, Setting;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            Setting = body.Setting;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('setapp: EiMMA=%s,SToken=%s,Setting=%s',EiMMA,SToken,Setting);
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    //console.log('setapp mma=%s', ucmma);
                    inet.CallXrpc(ucmma, 'eiSetAppSetting', [ EiMMA, SToken, Setting], null, null, function(result){
                        //console.log('xrpc setapp result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result);
                    });
                })
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};    
            }
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "getqpin": function(head, body){
        if ( typeof body == 'object' ){
            if (adbg >= 1) console.log("getqpin: body=%s", JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                if (adbg >= 1) console.log('getqpin: EiMMA=%s,SToken=%s',EiMMA,SToken);
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    //console.log('getqpin mma=%s', ucmma);
                    inet.CallXrpc(ucmma, 'eiGenQPin', [ EiMMA, SToken ], null, null, function(result){
                        if (adbg >= 1) console.log('xrpc getqpin result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result); 
                    });
                })
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};
            }
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "findqpin": function(head, body){
        if ( typeof body == 'object' ){
            //("getqpin: body=%s", JSON.stringify(body));
            var EiMMA, SToken, QPin;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            QPin = body.QPin;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('findqpin: EiMMA=%s,SToken=%s,QPin=%s',EiMMA,SToken,QPin);
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    //console.log('findqpin mma=%s', ucmma);
                    inet.CallXrpc(ucmma, 'eiFindQPin', [ EiMMA, SToken, QPin], null, null, function(result){
                        //console.log('xrpc findqpin result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result);
                    });
                })
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};
            }
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "search": function(head, body){
        if ( typeof body == 'object' ){
            if ( adbg >= 1 ) console.log("search: body=%s", JSON.stringify(body));
            var EiMMA, SToken, Keyword;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            Keyword = body.Keyword;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('search: EiMMA=%s,SToken=%s,Keyword=%s',EiMMA,SToken,Keyword);
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    session.SearchDevice( EiMMA, SToken, Keyword, function(result){
                        resolve(result);
                    });
                    /*
                    inet.CallXrpc(ucmma, 'eiSearch', [ EiMMA, SToken, Keyword], null, null, function(result){
                        //console.log('xrpc nearby result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result);
                    });
                    */
                });
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};
            }
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "nearby": function(head, body){
        if (adbg >= 1) console.log('appmain:nearby %s body=%s', typeof body, JSON.stringify(body));
        if ( typeof body == 'object' ){
            if (adbg >= 1) console.log('appmain:nearby body=%s', JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('nearby: EiMMA=%s,SToken=%s',EiMMA,SToken);
                return new Promise(function(resolve) {
                    // do a thing, possibly async, then…
                    inet.CallXrpc(ucmma, 'eiNearBy', [EiMMA, SToken], null, null, function(result){
                        //console.log('xrpc nearby result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result); 
                    });
                });
            }
            else {
                //var errmsg = 'no session';
                return {"ErrCode":amerr.SS_ERROR_NoRegData,"ErrMsg":amerr.SS_ERROR_NoRegData_Msg};    
            }
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "call": function(head, body){
        console.log("call from=%s", head.from);
        if (adbg >= 1) console.log("appmain:call body=%s", JSON.stringify(body));
        InTraceProc(body);
        session.RouteXrpc(head, body, function(result){
            if (adbg >= 1) console.log('appmain:call result=%s', JSON.stringify(result));
            if ( result[0] ) InTraceResp(result[0].Reply);
            return result;
        });
        /*
        return new Promise(function(resolve) {
            // do a thing, possibly async, then…
            session.RouteXrpc(head, body, function(result){
                if (adbg >= 1) console.log('appmain:call result=%s', JSON.stringify(result));
                if ( result[0] ) InTraceResp(result[0].Reply);
                resolve(result); 
            });
        })
        */
    },
    "echo": function(head, body){
        var sbody
        //var reply = {"body":{"result":""}};
        //console.log("echo: head=%s", JSON.stringify(head));
        if ( typeof body == 'object'){
            sbody = JSON.stringify(body);
        }
        else {
            sbody = body;
        }
        if (adbg >= 1) console.log("echo rcve: body=%s", sbody);
        return body;
    },
    "poll": function(head, body){
        //console.log("poll: head=%s", JSON.stringify(head));
        return new Promise(function(resolve) {
            // do a thing, possibly async, then…
            session.poll(head.from, function(reply){
                //console.log('poll reply=%s', JSON.stringify(reply));
                resolve(reply); 
            });
        })
    }  
}

var XrpcDcSecService = {
    "callto": function(head, body){
        console.log("appmain:callto from=%s", head.from);
        if (adbg >= 1) console.log("callto: body=%s", JSON.stringify(body));
        InTraceProc(body);
        return new Promise(function(resolve) {
            // do a thing, possibly async, then…
            session.CallXrpc(head, body, function(result){
                if ( result.Reply ) InTraceResp(result.Reply);
                if (adbg >= 1) console.log('callto result=%s', JSON.stringify(result));
                resolve(result); 
            });
        })
    },
    "sendto": function(head, body){
        console.log("appmain:sendto from=%s", head.from);
        if (adbg >= 1) console.log("sendto: body=%s", JSON.stringify(body));
        InTraceProc(body);
        return new Promise(function(resolve) {
            // do a thing, possibly async, then…
            session.CallXmsg(head, body, function(result){
                if ( result.Reply ) InTraceResp(result.Reply);
                if (adbg >= 1) console.log('sendto result=%s', JSON.stringify(result));
                resolve(result); 
            });
        }).then(
            function(result){
                //console.log('xrpc resolve=%s', JSON.stringify(result));
                return result;
            }
        )
    }
}
   
