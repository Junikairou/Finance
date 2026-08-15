/* Ce qui n'existe que dans l'application Android (APK).

   Sur le site, ce fichier n'est pas chargé du tout : c'est tools/build-www.js
   qui l'insère dans les pages copiées dans www/. Le reste du code est donc
   strictement identique entre le site et l'application.

   Deux choses seulement :
   1. <html data-natif="1"> — pour distinguer les deux au besoin (CSS ou JS).
   2. Le bouton (ou le geste) « retour » d'Android : il recule d'une page tant
      qu'il y en a une derrière, puis met l'application en arrière-plan au lieu
      de la fermer. C'est le comportement attendu sur Android ; sans ce
      branchement, la WebView se contente de fermer l'application au premier
      appui.
*/

(function () {
  'use strict';

  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

  document.documentElement.setAttribute('data-natif', '1');

  const App = cap.Plugins && cap.Plugins.App;
  if (!App || !App.addListener) return;

  /* Les noms appelés ici sont ceux des méthodes natives (@PluginMethod) du
     plugin @capacitor/app : sans bundler, les enrobages JS ne sont pas chargés. */
  App.addListener('backButton', (info) => {
    if (info && info.canGoBack) window.history.back();
    else App.minimizeApp();
  });
})();
