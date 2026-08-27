(function () {
  var HASH = "abee2e3cbd1214c17554053d0caeeefa35969f08250a90ec2baec7d719785ac7";
  if (sessionStorage.getItem("gate_ok") === HASH) return;

  document.documentElement.style.visibility = "hidden";

  function sha256(str) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function ask() {
    var pw = prompt("Enter password");
    if (pw === null) { ask(); return; }
    sha256(pw).then(function (h) {
      if (h === HASH) {
        sessionStorage.setItem("gate_ok", HASH);
        document.documentElement.style.visibility = "";
      } else {
        ask();
      }
    });
  }

  window.addEventListener("DOMContentLoaded", ask);
})();
