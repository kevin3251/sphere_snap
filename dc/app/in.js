// in: module for in metwork
// Date: 2019/03/21
// Version: 1.3
// Update:
// Add EndSession

var exports = module.exports = {};
var appname = '';
var iocmma = '';
var mbusgw = '';
var mbusport;

var motebus;
var inmsgcb;
var eventcb;
var sscb;
var mbstate = '';
var mymote;
var mymma = '';
var mymmaport = '';
var xmsg;
var xrpc;
var xrpcstate = '';
var inerr;
var doready = null;
var firstready = true;
var firstopen = true;
const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DefaultXmsgTimeout = 12;
const DefaultXrpcTimeout = 12;
const DefaultWaitTimeout = 24;
const dbg = 0;		// debug level: 0, 1, 2
var mlog = null;

// module: open IN layer
// conf: configuration of IN layer
// AppName: app name used as MMA 
// IOC: the MMA of IOC
// MotebusGW: ip of motebus gateway
// cb: init result callback
exports.Open = function( conf, log, cb ){
    try {
		inerr = require('./inerr');
    	console.log('inerr chk=%s', inerr.IN_OKMSG);
        appname = conf.AppName ? conf.AppName : '';
		iocmma = conf.IOC ? conf.IOC : '';
		mbusgw = conf.MotebusGW ? conf.MotebusGW : '';
		mbusport = conf.MotebusPort ? conf.MotebusPort : 6161;
		console.log('in:init appname=%s iocmma=%s mbusgw=%s', appname, iocmma, mbusgw);
		if ( log ) mlog = log;
        mbusOpen(cb);
    }
    catch(e){
        console.log('in:init error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message});
		if ( mlog ) mlog.savetoLog('in:open', app + ' ' + e.message);
	}
}

// module: motechat event handler
// stype: "message" is for incoming message, "state" is for state changed
// handler: the entry of get handler
exports.On = function( stype, handler ){
	try {
		if ( stype == 'message' && typeof handler == 'function' ){
			inmsgcb = handler;
			return true;
		}
		else if ( stype == 'state' && typeof handler == 'function' ){
			eventcb = handler;
			return true;
		}
		else if ( stype == 'ss' && typeof handler == 'function' ){
			mccb = handler;
			return true;
		}
	}
	catch(err){
		console.log('On error=%s', err.message);
		if ( mlog ) mlog.savetoLog('in:on', err.message);
	}
	return false;
}

// module: motchat get handler of incoming message
// handler: the entry of get handler
exports.GetXmsg = function(handler){
    if ( typeof handler == 'function')
        inmsgcb = handler;
}

// module: send x-message to remote
// mma: destination of MMA
// data: data object sent
// files: files sent
// timeout: timeout of send x-message
// waitreply: timeout of wait reply, must greater then DefaultXmsgTimeout
// cb: result callback

exports.SendXmsg = function( mma, body, files, timeout, waitreply, cb ){
	//if ( dbg >= 1 ) console.log( '--%s: SendXmsg mma=%s body=%s t1=%d t2=%d', CurrentTime(), mma, JSON.stringify(body), timeout, waitreply);
    try {
        sendxmsg( mma, body, files, timeout, waitreply, cb );
    }
    catch(e){
        console.log('in:SendXmsg error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message});
		if ( mlog ) mlog.savetoLog('in:sendxmsg', mma + ' ' + e.message);
	}
}

// module: reply message
// head: hearder of reply message
// body: body of reply message
// timeout: timeout of send x-message
// waitreply: timeout of wait reply, must greater then DefaultXmsgTimeout
// cb: result callback
exports.ReplyXmsg = function( head, body, timeout, waitreply, cb ){
	if ( dbg >= 1 ) console.log( '--%s: ReplyXmsg from=%s body=%s t1=%s t2=%s', CurrentTime(), head.from, JSON.stringify(body), timeout, waitreply);
    try {
        replyxmsg( head, body, timeout, waitreply, cb );
    }
    catch(e){
        console.log('in:replyxmsg error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message});
		if ( mlog ) mlog.savetoLog('in:replyxmsg', head.from + ' ' + e.message);
	}
}

exports.PublishXrpc = function(pubapp, func, cb){
	try {
        if ( xrpcstate == '' ){
            startxrpc(function(result){
                if ( result == inerr.IN_OKCODE ) {
                    publishxrpc( pubapp, func, cb );
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPCFail,"ErrMsg":IN_XRPCFail_Msg});
                }
            });    
        }
        else {
            publishxrpc( pubapp, func, cb );
        }
	}
	catch(err){
		console.log('in:publishxrpc error: %s', err.message);
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
		if ( mlog ) mlog.savetoLog('in:publish', pubapp + ' ' + err.message);
	}
}

exports.IsolatedXrpc = function(func, cb ){
	try {
		if ( xrpcstate != '' ){
			isolatedxrpc( func, cb );
		}
		else {
			if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
		}
	}
	catch(err){
		console.log('in:isolatedxrpc error: %s', err.message);
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
		if ( mlog ) mlog.savetoLog('in:isolated', err.message);
	}
}

// module: call xrpc to remote
// mma: destination MMA of xprc
// args: argument array, {in:{fm,to},data}
// timeout: timeout of send x-message
// waitreply: timeout of wait reply, must greater then DefaultXmsgTimeout
// cb: result callback
exports.CallXrpc = function( mma, func, args, timeout, waitreply, cb ){
	if ( xrpcstate == 'ready'){
		try {
			//if ( dbg >= 1 ) console.log( '--%s: CallXrpc mma=%s func=%s args=%s t1=%d t2=%d', CurrentTime(), mma, func, JSON.stringify(args), timeout, waitreply);
			var arr = [];
			if ( Array.isArray(args) == false )
				arr.push(args);
			else
				arr = args;
			//if ( dbg >= 2 ) console.log( '--%s: CallXrpc mma=%s func=%s arr=%s', CurrentTime(), mma, func, JSON.stringify(arr));
			var t1 = ( timeout == null ) ? DefaultXrpcTimeout : timeout;
			var t2 = ( waitreply == null ) ? DefaultWaitTimeout : waitreply;
			if ( dbg >= 1 ) console.log( '--%s: CallXrpc mma=%s func=%s args=%s t1=%d t2=%d', CurrentTime(), mma, func, JSON.stringify(args), t1, t2);
			xrpc.call( mma, func, arr, 10/*Prio*/, t1/*sec*/, t2 )
			.then((result)=>{
				if ( dbg >= 1 ) {
					if ( typeof result == 'string')
						console.log( '--%s: CallXrpc result=%s', CurrentTime(), result);
					else
						console.log( '--%s: CallXrpc result=%s', CurrentTime(), JSON.stringify(result));
				}
				if ( typeof cb == 'function' ) cb(result);
			})
			.catch((err)=>{
				console.log( '--%s: CallXrpc to=%s, error=%s', CurrentTime(), mma, JSON.stringify(err));
				if ( err ){
					if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message,"MMA":mma});
					if ( mlog ) mlog.savetoLog('in:callxrpc', mma + ' ' + err.message);
				}
			});
		}
		catch(e){
			console.log( '--%s: CallXrpc to=%s, error=%s', CurrentTime(), mma, e.message);
			if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message,"MMA":mma});
			if ( mlog ) mlog.savetoLog('in:callxrpc', mma + ' ' + e.message);
		}
	}
	else {
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
	}
}

exports.getmbInfo = function(cb){
	motebus.getInfo()
	.then(function(result){
		console.log("in:getInfo: result: %s", JSON.stringify(result) );
		mymma = appname + '@' + result.mmpHost;
		mymmaport = result.mmpPort;
		mymote = {"DDN":"","EiName":"","EiType":"","EiTag":"","EiHost":"","EiPort":"","EiMMA":"","EiUDID":"","WANIP":""};
		mymote.EiMMA = mymma;
		mymote.EiUDID = result.udid;
		mymote.EiHost = result.localIP;
		mymote.EiPort = mymmaport;
		mymote.WANIP = result.wanIP;
		if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Mote":mymote});
	})
	.catch(function(err){
		console.log("in:mbusOpen error: %s", err.message);
		if ( typeof cb == 'function')cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
		if ( mlog ) mlog.savetoLog('in:motebusInfo', err.message);
	});
}

exports.iocEvent = function(evId, evSource, evType, evClass, evBody){
	iocEvent(evId, evSource, evType, evClass, evBody);
}

exports.CreateTicket = function(len){
	return CreateTicket(len);
}

exports.GetTraceData = function(){
	var stime;
	stime = new Date();
	return {"mma":mymma,"time":stime};
}

// modules for mbus

var mbusOpen = function( cb ){
	if ( typeof cb == 'function' ) doready = cb;
	motebus = require('motebus');
	motebus.on('ready', function() {
		var state;
		console.log( '--%s: MoteBus Ready', CurrentTime());
		lastmbstate = mbstate;
		mbstate = 'ready';
		if ( typeof eventcb == 'function') {
			if ( firstready == true ) {
				state = mbstate;
				firstready = false;
			}
			else state = mbstate + '2';
			eventcb(state, '');
		}
		xrpcstate = '';
		openxmsg( motebus, appname, function(result){
            //if ( typeof cb == 'function')cb(result);
            if ( result.ErrCode == inerr.IN_OKCODE ){
                var xret = startxrpc();
				console.log('xRPC start: result=%d', xret);
			}
			if ( typeof doready == 'function') doready(result);
			if ( mlog ) mlog.savetoLog('in:openxmsg', appname + ' ' + JSON.stringify(result));
		});
	});
	motebus.on('off', function() {
		console.log( '--%s: MoteBus Off', CurrentTime());
		if ( mbstate != ''){
			lastmbstate = mbstate;
			mbstate = 'off';
			if ( typeof eventcb == 'function') {
				eventcb(mbstate, '');
			}
		}
		if ( mlog ) mlog.savetoLog('in:motebus', 'off');
	});
	motebus.on('hostState', (udid, online) =>{
		var state = online ? "OnLine" : "OffLine";
		if ( dbg >= 1 ) console.log("Event: hostState udid=%s state=%s", udid, state );
		motebus.getHostInfo(udid)
		.then((result)=>{
			if ( dbg >= 1 ) console.log("Event: hostInfo=%s", JSON.stringify(result));
			//var evId, evSource, evType, evClass, evBody, evDev;
			//evId = CreateTicket(7);
			//evSource = 'info';
			//evType = 'in';
			//evBody = {"Device":evDev,"action":"hostState","result":state};
			var evDev, evUdid, evBody;
			evUdid = result.udid ? result.udid : '';
			evDev = result.hostName ? result.hostName : result.udud;
			evBody = {"Device":evDev,"action":"hostState","result":state};
			//iocEvent(evId, evSource, evType, evClass, evBody);
			if ( typeof eventcb == 'function' ){
				var info = {"udid":evUdid,"state":state,"name":evDev};
				eventcb('hoststate', info);
			}
			if ( mlog ) mlog.savetoLog('in:hostState', JSON.stringify(evBody));
		});
	});
	console.log('Motebus gateway=%s,port=%d', mbusgw, mbusport);
	if ( mbusport )
		motebus.startUp(mbusgw, mbusport);
	else
		motebus.startUp(mbusgw);
}

var openxmsg = function( motebus, userid, cb ){
	var ret,state;
	try {
		xmsg = motebus.xMsg();
		xmsg.open( userid, 'plokijuhyg', false, function( err, result ){
			//console.error(err);
			if ( err ){
				console.log('in:openxmsg err=%s', JSON.stringify(err));
				ret = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message};
				if ( typeof cb == 'function' ) cb( ret );
			}
			else {
				console.log( '--%s: openxmsg=%s', CurrentTime(), result);
				lastmbstate = mbstate;
				mbstate = 'opened';
				ret = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKCODE_Msg,"Result":result};
				if ( typeof cb == 'function' ) cb( ret );
				if ( firstopen == true ) {
					state = mbstate;
					firstopen = false;
				}
				else state = mbstate + '2';
				if ( typeof eventcb == 'function') eventcb(state);
				//reptoboard(userid, '', 'in', 'info', userid + ': motebus open', '');
			}
		});
		xmsg.on('message', function(msg) {
			//console.log("Incoming Message: id=", msg.head.id, ", body=", JSON.stringify(msg.body), ", files=", msg.files );
			if ( dbg >= 1 ) console.log('--%s: message from=%s', CurrentTime(), msg.head.from);
			if ( dbg >= 2 ) console.log('--%s: message head=%s,body=%s', CurrentTime(), JSON.stringify(msg.head), JSON.stringify(msg.body));
			if ( msg.body.in ){
				if ( msg.body.in.msgtype ){
					var mtype = msg.body.in.msgtype;
					if ( mtype == 'adm ') incmdparser( msg );
					else inmsghandler( msg );
				}
				else inmsghandler( msg );
			}
			else {
				console.log('--%s: message from=%s', CurrentTime(), JSON.stringify(msg));
				ret = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"data format error"};
				if ( typeof cb == 'function' ) cb( ret );
			}
		});
	}
	catch(e){
		console.log('in:openxmsg err=%s', e.message);
		ret = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message};
		if ( typeof cb == 'function' ) cb( ret );
		if ( mlog ) mlog.savetoLog('in:openmsg', e.message);
	}
}


var incmdparser = function(msg){
	var msgtype = msg.body.in.msgtype;
	if ( msgtype == 'adm' ){
		inAdmHandler(msg);
	}
	else if ( msgtype == 'ss' ){
		if ( typeof sscb == 'function' ) sscb(msg);
	}
}

var inmsghandler = function(msg){
	// check msg format
	try {
		if ( typeof inmsgcb == 'function' ) {
			inmsgcb('xmsg', msg.head, msg.body, function(reply){
				replyxmsg(msg.head, reply, DefaultXmsgTimeout, 0);
			});
		}
	}
	catch(err){
		var body = {"response":"message","ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message};
		replyxmsg(msg.head, body, DefaultXmsgTimeout, 0);
	}
}

var sendxmsg = function( mma, body, files, timeout, waitreply, cb ){
	var state;
	//if ( dbg >= 1 ) console.log('--%s: sendxmsg mma=%s', CurrentTime(), mma);
	if ( mbstate == 'opened' ){
		try {
			var t1 = ( timeout == null ) ? DefaultXmsgTimeout : timeout;
			var t2 = ( waitreply == null ) ? DefaultWaitTimeout : waitreply;
			if ( dbg >= 1 ) console.log('--%s: sendxmsg mma=%s body=%s t1=%d t2=%d', CurrentTime(), mma, JSON.stringify(body), t1, t2);
			xmsg.send(mma, body, files, 10/*Prio*/, t1, t2, 
			function(err, tkinfo) { 
				if (err) {
					//console.error(err);
					console.log('--%s: sendxmsg: to=%s, error=%s', CurrentTime(), mma, JSON.stringify(err));
					if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message,"MMA":mma});
					if ( mlog ) mlog.savetoLog('in:sendxmsg', mma + ' ' + err.message);
				}
				else {
					if ( dbg >= 2 ) console.log("--%s: sendxmsg: tkinfo(send) id=%s, state=%s", CurrentTime(), tkinfo.id, tkinfo.state);
					state = tkinfo.state;
					if (state != 'Reply') {
						//console.log("Send Message: tkinfo(send) id=%s, state=%s", tkinfo.id, tkinfo.state);
						if ( t2 == 0 && state == 'Read') {
							if ( dbg >= 1 ) console.log("--%s: sendxmsg: state=%s", CurrentTime(), state);
							if ( typeof cb == 'function' ) cb( {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"State":state} );
						}
						else if ( state != 'Sent' && state != 'Read' && state != 'End') {
							if ( dbg >= 0 ) console.log("--%s: sendxmsg: state=%s", CurrentTime(), state);
							var errmsg = inerr.IN_SendError_Msg + ' ' + state;
							if ( typeof cb == 'function' ) cb( {"ErrCode":inerr.IN_SendError,"ErrMsg":errmsg,"State":state,"MMA":mma} );
							if ( mlog ) mlog.savetoLog('in:sendxmsg', mma + ' ' + state + ' ' + t1.toString());
						}
					}
					else {
						if ( typeof cb == 'function') {
							if ( dbg >= 1 ) console.log("--%s: sendxmsg Reply from: %s", CurrentTime(), JSON.stringify(tkinfo.msg.head.from) );
							if ( dbg >= 1 ) console.log("--%s: sendxmsg Reply: %s", CurrentTime(), JSON.stringify(tkinfo.msg.body) );
							cb( tkinfo.msg.body );
						}
					}
				}
			});
		}
		catch(e){
			console.log('--%s: sendxmsg: to=%s, error=%s', CurrentTime(), mma, e.message);
			if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message,"MMA":mma});
			if ( mlog ) mlog.savetoLog('in:sendxmsg', mma + ' ' + e.message);
		}
	}
	else {
		if ( typeof cb == 'function') cb( {"ErrCode":inerr.IN_Mbus_NotOpen,"ErrMsg":inerr.IN_Mbus_NotOpen_Msg} );
	}
}

var replyxmsg = function(head, body, timeout, waitreply, cb ){
	var state;
	if ( dbg >= 1 ) console.log('--%s: replyxmsg from=%s', CurrentTime(), head.from);
	if ( mbstate == 'opened'){
		try {
			var t1 = ( timeout == null ) ? DefaultXmsgTimeout : timeout;
			var t2 = ( waitreply == null ) ? DefaultWaitTimeout : waitreply;
			if ( dbg >= 1 ) console.log('--%s: replyxmsg body=%s t1=%d t2=%d', CurrentTime(), JSON.stringify(body), t1, t2);
			xmsg.reply( head, body, [], 10/*Prio*/, t1/*sec*/, t2, 
				function(err, tkinfo) {
					if (err) {
						console.error(err);
						if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
						if ( mlog ) mlog.savetoLog('in:replyxmsg', head.from + ' ' + err.message);
					} else {
						state = tkinfo.state;
						if ( dbg >= 2 ) console.log("--%s: replyxmsg: to=%s id=%s state= %s", CurrentTime(), head.from, tkinfo.id, state);
						if ( state != 'Sent' && state != 'Read' && state != 'End') {
							console.log("--%s: replyxmsg: to=%s state= %s", CurrentTime(), head.from, state);
							if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_SendError,"ErrMsg":inerr.IN_SendError_Msg,"State":state});
							if ( mlog ) mlog.savetoLog('in:replyxmsg', head.from + ' ' + state + ' ' + t1.toString());
						}
						else if ( state == 'Read' ) {
							if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"State":state});
						}
					}
				}
			);
		}
		catch(e){
			console.log('--%s: replyxmsg: to=%s, error=%s', CurrentTime(), head.from, e.message);
			if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message,"To":head.from});
			if ( mlog ) mlog.savetoLog('in:replyxmsg', head.from + ' ' + e.message);
		}
	}
	else {
		if ( typeof cb == 'function'){
			cb({"ErrCode":inerr.IN_Mbus_NotOpen,"ErrMsg":inerr.IN_Mbus_NotOpen_Msg});
		}
	}
}


var startxrpc = function(cb){
	if ( mbstate == 'opened' || mbstate == 'opened2' ) {
		if ( xrpcstate == '' ){
			xrpc = motebus.xRPC();
			console.log('--%s: xrpc started', CurrentTime());
            xrpcstate = 'ready';
            if ( typeof cb == 'function' ) cb(inerr.IN_OKCODE);
            else return inerr.IN_OKCODE;
		}
		else if ( xrpcstate == 'ready' ){
            if ( typeof cb == 'function' ) cb(inerr.IN_OKCODE);
            else return inerr.IN_OKCODE;
		}
    }
    else {
        if ( typeof cb == 'function' ) cb(inerr.IN_ERRCODE);
        else return inerr.IN_ERRCODE;
    }
}

var publishxrpc = function(pubapp, func, cb){
    if ( xrpcstate == 'ready' &&  pubapp != '' ){
        //console.log( 'in:publishxrpc pubapp=%s', pubapp );
        xrpc.publish( pubapp, func )
        .then( function(result){
            //console.log('in:publishxrpc app=%s result=%s', pubapp, result);
            if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Result":result});
        })
        .catch( function(err){
            //console.log('in:publishxrpc app=%s error=%s', pubapp, err.message);
            if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
        });
    }
    else {
        //console.log('in:publishxrpc error: xrpc not ready of appname is empty');
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
    }
}

var isolatedxrpc = function(func, cb){
    if ( xrpcstate == 'ready' ){
        xrpc.isolated( func )
        .then( function(result){
            //console.log('in:isolatedxrpc result=%s', result);
            if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Result":result});
        })
        .catch( function(err){
            //console.log('in:isolatedxrpc error=%s', err.message);
            if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
        });
    }
    else {
        //console.log('in:isolatedxrpc error: xrpc not ready of appname is empty');
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
    }
}

// evID: event id.
// evSource: source URI of event.
// evType: type of event: 'info', 'error'
// evClass: class of event: 'in', 'proc', 'qqn'
// evBody: payload of event.
var iocEvent = function( evId, evSource, evType, evClass, evBody ){
	var evData = {"MsgType":evType,"MsgClass":evClass,"MsgBody":evBody};
	var evpack = {"eventType":"com.ypcloud.dc","cloudEventsVersion":"0.1","source":evSource,"eventID":evId,"data":evData};
	if ( iocmma != '' ){
		if ( dbg >= 1 ) console.log('--%s: iocmma=%s', CurrentTime(), iocmma);
		var t1 = DefaultXmsgTimeout;
		xmsg.send(iocmma, evpack, [], 10/*Prio*/, t1, 0, 
			function(err, tkinfo) { 
				if (err) {
					//console.error(err);
					console.log('--%s: sendxmsg to ioc: error=%s', CurrentTime(), JSON.stringify(err));
					if ( mlog ) mlog.savetoLog('in:iocevent', iocmma + ' ' + JSON.stringify(err));
				}
				else {
					state = tkinfo.state;
					if ( state != 'Sent' && state != 'Read' && state != 'End' && state != 'Reply') {
						if ( mlog ) mlog.savetoLog('in:iocevent', iocmma + ' ' + state + ' ' + t1.toString());
					}
					else if (state == 'Sent') {
						console.log('--%s: sendxmsg to ioc: state=Sent', CurrentTime());
					}
				}
			});
	}	
}

var inAdmHandler = function( msg ){
	try {
		var head = msg.head;
		var body = msg.body;
		var inctl = body.in;
		var req = body.request;
		var reply;
		if ( req == 'info' ){
			reply = {"response":"info","data":{"state":mbstate,"mymote":mymote}};
			replyxmsg( head, reply, DefaultXmsgTimeout, 0 );
		}
	}
	catch(e){
		console.log('inAdmHandler error=%s', e.message);
	}
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}

var CreateTicket =function(len) {
    var text = "";
    //var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < len; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}