(function () {
  var reconnecting = false;
  function reconnect() {
    if (reconnecting) return;
    reconnecting = true;
    var status = document.getElementById('offline-status');
    if (status) status.textContent = 'Network restored. Reconnecting…';
    window.setTimeout(function () {
      window.location.replace('/darkbear/?reconnect=1');
    }, 250);
  }
  window.addEventListener('online', reconnect);
})();
