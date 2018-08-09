'use strict';

let errs = {
    IN_OKCODE : 0,
    IN_ERRCODE : -10199,
    IN_XRPCFail : -10101,
    IN_XRPC_NotReady : -10102,
    IN_Mbus_NotOpen : -10103,
    IN_SendError : -10104,
    IN_OKMSG : "OK",
    IN_XRPCFail_Msg : "open XRPC error",
    IN_XRPC_NotOpen_Msg : "XRPC not open",
    IN_Mbus_NotOpen_Msg : "Mbus not open",
    IN_SendError_Msg : "send error"
};

module.exports =
        Object.freeze(errs); // freeze prevents changes by users
