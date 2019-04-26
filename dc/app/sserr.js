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
    SS_ERROR_Busy : -10412,
    SS_OKMSG : 'OK',
    SS_ERROR_UcFail_Msg : 'dc: UC fail',
    SS_ERROR_DcNotReady_Msg : 'dc: Not ready',
    SS_ERROR_NoWanIp_Msg : 'dc: No WAN ip',
    SS_ERROR_DcRestart_Msg : 'dc: Restart',
    SS_ERROR_NoRegData_Msg : 'dc: Not reg',
    SS_ERROR_InvalidData_Msg : 'dc: Invalid data',
    SS_ERROR_TargetNotFound_Msg : 'dc: Device off or none',
    SS_ERROR_SetDeviceInfoError_Msg : 'dc: Set device error',
    SS_ERROR_NoTarget_Msg : 'dc: Device blank',
    SS_ERROR_DCStartFail_Msg : 'dc: Startup fail',
    SS_ERROR_SendError_Msg : 'dc: Send error',
    SS_ERROR_Busy_Msg : 'dc: System busy',
};

module.exports =
        Object.freeze(errs); // freeze prevents changes by users

