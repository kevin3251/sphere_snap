'use strict';

let errs = {
    SS_OKCODE : 0,
    SS_ERRCODE : -10499,
    SS_ERROR_UcFail :-10401,
    SS_ERROR_DcNotReady : -10402,
    SS_ERROR_NoWanIp : -10403,
    SS_ERROR_DcRestart : -10404,
    SS_ERROR_NoRegData : -10405,
    SS_ERROR_InvalidData : -10406,
    SS_ERROR_TargetNotFound : -10407,
    SS_ERROR_SetDeviceInfoError : -10408,
    SS_ERROR_NoTarget : -10409,
    SS_ERROR_DCStartFail : -10410,
    SS_ERROR_SendError : -10411,
    SS_OKMSG : 'OK',
    SS_ERROR_UcFail_Msg : 'UC fail',
    SS_ERROR_DcNotReady_Msg : 'DC not ready',
    SS_ERROR_NoWanIp_Msg : 'no WAN ip',
    SS_ERROR_DcRestart_Msg : 'DC restarted',
    SS_ERROR_NoRegData_Msg : 'not reg',
    SS_ERROR_InvalidData_Msg : 'invalid data',
    SS_ERROR_TargetNotFound_Msg : 'target not found',
    SS_ERROR_SetDeviceInfoError_Msg : 'set device info error',
    SS_ERROR_NoTarget_Msg : 'no target',
    SS_ERROR_DCStartFail_Msg : 'DC startup fail',
    SS_ERROR_SendError_Msg : 'send error'
};

module.exports =
        Object.freeze(errs); // freeze prevents changes by users

