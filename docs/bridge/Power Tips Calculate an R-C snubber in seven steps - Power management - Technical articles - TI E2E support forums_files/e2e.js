//$(document ).ready(function() {
//    $("body").on('click keypress', function () {
//        ResetThisSession();
//    });
//});
//
//var timeInSecondsAfterSessionOut = 3600; // change this to change session time out (in seconds). Default set ot 1 hour
//var secondTick = 0;
//
//function ResetThisSession() {
//    secondTick = 0;
//}
//
//function StartThisSessionTimer() {
//    secondTick++;
//    var timeLeft = ((timeInSecondsAfterSessionOut - secondTick) / 60).toFixed(0); // in minutes
//    timeLeft = timeInSecondsAfterSessionOut - secondTick; // override, we have 30 secs only 
//
//    if (secondTick > timeInSecondsAfterSessionOut) {
//        $.telligent.evolution.notifications.show("Session Expired.", {type:'warning', duration: 10000});
//        clearTimeout(tick);
//        window.location = "/Logout";
//        return;
//    }
//    tick = setTimeout("StartThisSessionTimer()", 1000);
//}
//
//if(window.location.href.indexOf("/logout") == -1){
//    StartThisSessionTimer();
//}