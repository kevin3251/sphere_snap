var exports = module.exports = {};
var inet;
var ucmma;
var appname;
var updc = [];
/*
var MAIN_OKCODE = 0;
var MAIN_OKMSG = "OK";
var MAIN_ERRCODE = -251;
*/
var session;
var snState = '';
var amerr;

exports.Start = function( conf ){
    amerr = require('./sserr');
    console.log('chk err=%s', amerr.SS_OKMSG);
    ucmma = conf.ucenter;
    appname = conf.appname;
    if ( typeof conf.uplinkdc == 'string' && conf.uplinkdc != '' ) {
        var up = conf.uplinkdc;
        updc = up.split(',');
    } 
    inet = require('./in');
    inet.On('state', function(state, info){
        MbusStateFunc(state, info);
    });
    inet.Open(conf.appname, conf.ioc, false, function(result){
        console.log('Start result=%s', JSON.stringify(result) );
        if ( result.ErrCode == amerr.SS_OKCODE ){
            session = require('./session');
            session.Open(ucmma, inet, function(result){
                if ( result ) snState = 'ready';
            });
        }
        else console.log('Start error=%s', result.ErrMsg);
    });
}

var SetupDcChannel = function(){
    var mma;
    var body = {"stoken":"","target":"","data":"hello"};
    for ( var i = 0; i < updc.length; i++ ){
        mma = 'dc@' + updc[i];
        console.log('SetupDcChannel mma=%s', mma);
        inet.CallXrpc( mma, 'echo', 'hello', function(result){
            console.log('SetupDcChannel result=%s', JSON.stringify(result));
        })
    }
}

var MbusStateFunc = function(state, info){
    //console.log('MbusStateFunc %s typeof info=%s',state, typeof info);
    console.log('MbusStateFunc %s',state);
    if ( state == 'opened'){
        inet.PublishXrpc( appname, XrpcDcService, function(result){
            console.log('Start publish: result=%s', JSON.stringify(result));
            if ( result.ErrCode == amerr.SS_OKCODE ){
                inet.IsolatedXrpc( XrpcDcSecService, function(result){
                    console.log('Start isolated: result=%s', JSON.stringify(result));
                    if ( updc.length > 0 ) SetupDcChannel();
                });
            }
        });
        //session = require('./edge/session.js');
        //session.Init(ucmma, inet, result.Mote);
        inet.On('message', XmsgRcve);
    }
    else if ( state == 'opened2') {
        inet.PublishXrpc( appname, XrpcDcService, function(result){
            console.log('Start publish: result=%s', JSON.stringify(result));
            inet.IsolatedXrpc( XrpcDcSecService, function(result){
                console.log('Start isolated: result=%s', JSON.stringify(result));
                session.Reset();
            });
        });
    }
    else if ( state == 'hoststate'){
        console.log('hoststate: info=%s', JSON.stringify(info));
    }

}

var XmsgRcve = function(ptype, head, body){
    console.log("XmsgRcve: head=%s", JSON.stringify(head));
    console.log("XmsgRcve: body=%s", JSON.stringify(body));
    session.RouteXmsg(head, body, function(result){
        console.log('RouteXmsg result=%s', JSON.stringify(result));
        inet.ReplyXmsg(head, result);
    });
}

var XrpcDcService = {
    "reg": function(head, body){
        if ( typeof body == 'object' ){
            //console.log("reg: head=%s", JSON.stringify(head));
            //console.log("reg: body=%s", JSON.stringify(body));
            var EiUDID, EiMMA, WIP, LIP, AppKey, EiToken, SToken, EiUMMA, EiUPort;
            EiUDID = head.by;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            //WIP = head.remoteIP;
            //LIP = EiMMA.substr( EiMMA.indexOf('@')+1 );
            //if ( LIP.indexOf(':') > 0 )
            //    LIP = LIP.substr(0, LIP.indexOf(':'));
            AppKey = body.AppKey;
            EiToken = body.EiToken;
            SToken = body.SToken;
            EiUMMA = body.EiUMMA;
            EiUPort = body.EiUPort;
            if ( typeof body.WIP == 'string' ) WIP = body.WIP;
            else WIP = '';
            if ( typeof body.LIP == 'string' ) LIP = body.LIP;
            else LIP = '';
            console.log('reg: para: EiUDID=%s,EiMMA=%s,WIP=%s,LIP=%s,AppKey=%s,EiToken=%s,SToken=%s',EiUDID,EiMMA,WIP,LIP,AppKey,EiToken,SToken);
            return new Promise(function(resolve, reject) {
                // do a thing, possibly async, then…
                session.StartSession(EiUDID, EiMMA, WIP, LIP, AppKey, EiToken, SToken, EiUMMA, EiUPort, function(result){
                    resolve(result);
                });
            }).then(
                function(reply){
                    console.log('reg: reply=%s', JSON.stringify(reply));
                    return reply;
                }
            )
        }
        else
            return {"ErrCode":amerr.SS_ERROR_InvalidData,"ErrMsg":amerr.SS_ERROR_InvalidData_Msg}; 
    },
    "unreg": function(head, body){
        if ( typeof body == 'object' ){
            console.log("unreg: body=%s", JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                console.log('unreg: EiMMA=%s,SToken=%s',EiMMA, SToken);
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    session.EndSession(EiMMA, SToken, function(result){
                        resolve(result);
                    });
                }).then(
                    function(result){
                        //console.log('xrpc resolve=%s', JSON.stringify(result));
                        return result;
                    }
                )
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
        //console.log("resetreg: head=%s", JSON.stringify(head));
        console.log("resetreg: body=%s", JSON.stringify(body));
        var udid = head.by;
        var mma = body.EiUMMA;
        return new Promise(function(resolve, reject) {
            // do a thing, possibly async, then…
            session.ResetSession(udid, mma, function(result){
                console.log("resetreg: return=%s", JSON.stringify(result));
                resolve(result);
            });
        }).then(
            function(result){
                //console.log('xrpc resolve=%s', JSON.stringify(result));
                return result;
            }
        )
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
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    inet.CallXrpc(ucmma, 'eiGetEdgeInfo', [ EiMMA, SToken ], function(result){
                        //console.log('xrpc getinfo result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result); 
                    });
                }).then(
                    function(result){
                        //console.log('xrpc resolve=%s', JSON.stringify(result));
                        if ( result.ErrCode == 0 )
                            session.AddDeviceInfo(SToken, result.result);
                        return result;
                    }
                )
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
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    inet.CallXrpc(ucmma, 'eiSetEdgeInfo', [ EiMMA, SToken, EdgeInfo ], function(result){
                        //console.log('xrpc setinfo result=%s', JSON.stringify(result));
                        if ( result == true ){
                            session.AddDeviceInfo(SToken, EdgeInfo);
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG});
                        }
                        else {
                            resolve({"ErrCode":amerr.SS_ERROR_SetDeviceInfoError,"ErrMsg":amerr.SS_ERROR_SetDeviceInfoError_Msg});
                        }
                    });
                }).then(
                    function(result){
                        //console.log('xrpc resolve=%s', JSON.stringify(result));
                        return result;
                    }
                )
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
            //console.log("getapp: body=%s", JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('getapp: EiMMA=%s,SToken=%s',EiMMA,SToken);
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    //console.log('getapp mma=%s', ucmma);
                    inet.CallXrpc(ucmma, 'eiGetAppSetting', [ EiMMA, SToken ], function(result){
                        //console.log('xrpc getapp result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OEMSG,"result":result});
                        else
                            resolve(result); 
                    });
                }).then(
                    function(result){
                        //console.log('xrpc resolve=%s', JSON.stringify(result));
                        return result;
                    }
                )
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
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    //console.log('setapp mma=%s', ucmma);
                    inet.CallXrpc(ucmma, 'eiSetAppSetting', [ EiMMA, SToken, Setting], function(result){
                        //console.log('xrpc setapp result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result);
                    });
                }).then(
                    function(result){
                        //console.log('xrpc resolve=%s', JSON.stringify(result));
                        return result;
                    }
                )
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
            console.log("getqpin: body=%s", JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                console.log('getqpin: EiMMA=%s,SToken=%s',EiMMA,SToken);
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    //console.log('getqpin mma=%s', ucmma);
                    inet.CallXrpc(ucmma, 'eiGenQPin', [ EiMMA, SToken ], function(result){
                        console.log('xrpc getqpin result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result); 
                    });
                }).then(
                    function(result){
                        //console.log('xrpc resolve=%s', JSON.stringify(result));
                        return result;
                    }
                )
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
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    //console.log('findqpin mma=%s', ucmma);
                    inet.CallXrpc(ucmma, 'eiFindQPin', [ EiMMA, SToken, QPin], function(result){
                        //console.log('xrpc findqpin result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result);
                    });
                }).then(
                    function(result){
                        console.log('xrpc resolve=%s', JSON.stringify(result));
                        return result;
                    }
                )
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
            console.log("search: body=%s", JSON.stringify(body));
            var EiMMA, SToken, Keyword;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            Keyword = body.Keyword;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('search: EiMMA=%s,SToken=%s,Keyword=%s',EiMMA,SToken,Keyword);
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    inet.CallXrpc(ucmma, 'eiSearch', [ EiMMA, SToken, Keyword], function(result){
                        //console.log('xrpc nearby result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result);
                    });
                }).then(
                    function(result){
                        console.log('xrpc resolve=%s', JSON.stringify(result));
                        return result;
                    }
                )
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
        console.log('appmain:nearby %s body=%s', typeof body, JSON.stringify(body));
        if ( typeof body == 'object' ){
            //("nearby: body=%s", JSON.stringify(body));
            console.log('appmain:nearby body=%s', JSON.stringify(body));
            var EiMMA, SToken;
            EiMMA = head.from;
            //if ( EiMMA.indexOf(';') > 0 ) EiMMA = EiMMA.substr(0, EiMMA.indexOf(';'));
            SToken = body.SToken;
            if ( session.ChkSToken(SToken) >= 0 ){
                //console.log('nearby: EiMMA=%s,SToken=%s',EiMMA,SToken);
                return new Promise(function(resolve, reject) {
                    // do a thing, possibly async, then…
                    inet.CallXrpc(ucmma, 'eiNearBy', [EiMMA, SToken], function(result){
                        //console.log('xrpc nearby result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode == 'undefined' )
                            resolve({"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result});
                        else
                            resolve(result); 
                    });
                }).then(
                    function(result){
                        console.log('xrpc resolve=%s', JSON.stringify(result));
                        return result;
                    }
                )
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
        //console.log("call head=%s", JSON.stringify(head));
        console.log("call: body=%s", JSON.stringify(body));
        return new Promise(function(resolve, reject) {
            // do a thing, possibly async, then…
            session.RouteXrpc(head, body, function(result){
                console.log('call result=%s', JSON.stringify(result));
                resolve(result); 
            });
        }).then(
            function(result){
                //console.log('xrpc resolve=%s', JSON.stringify(result));
                return result;
            }
        )
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
        console.log("echo rcve: body=%s", sbody);
        return body;
    },
    "poll": function(head, body){
        //console.log("poll: head=%s", JSON.stringify(head));
        return new Promise(function(resolve, reject) {
            // do a thing, possibly async, then…
            session.poll(head.from, function(reply){
                //console.log('poll reply=%s', JSON.stringify(reply));
                resolve(reply); 
            });
        }).then(
            function(result){
                //console.log('xrpc resolve=%s', JSON.stringify(result));
                return {"ErrCode":amerr.SS_OKCODE,"ErrMsg":amerr.SS_OKMSG,"result":result};
            }
        )
    }  
}

var XrpcDcSecService = {
    "callto": function(head, body){
        //console.log("callto: head=%s", JSON.stringify(head));
        console.log("callto: body=%s", JSON.stringify(body));
        return new Promise(function(resolve, reject) {
            // do a thing, possibly async, then…
            session.CallXrpc(head, body, function(result){
                console.log('callto result=%s', JSON.stringify(result));
                resolve(result); 
            });
        }).then(
            function(result){
                //console.log('xrpc resolve=%s', JSON.stringify(result));
                return result;
            }
        )
    },
    "sendto": function(head, body){
        //console.log("sendto: head=%s", JSON.stringify(head));
        console.log("sendto: body=%s", JSON.stringify(body));
        return new Promise(function(resolve, reject) {
            // do a thing, possibly async, then…
            session.CallXmsg(head, body, function(result){
                console.log('sendto result=%s', JSON.stringify(result));
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
   
