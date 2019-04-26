'use strict';

let errs = {
    IN_OKCODE : 0,
    IN_ERRCODE : -10199,
    IN_XRPCFail : -10101,
    IN_XRPC_NotReady : -10102,
    IN_Mbus_NotOpen : -10103,
    IN_SendError : -10104,
    IN_XMsgFail : -10105,
    IN_InvalidData : -10106,
    IN_OKMSG : "OK",
    IN_XRPCFail_Msg : "in: Open XRPC error",
    IN_XRPC_NotReady_Msg : "in: XRPC not ready",
    IN_Mbus_NotOpen_Msg : "in: Motebus not open",
    IN_SendError_Msg : "in: Send error",
    IN_XMsgFail_Msg : "in: Open XMsg error",
    IN_InvalidData_Msg : "in: Invalid data"
};

module.exports =
        Object.freeze(errs); // freeze prevents changes by users
