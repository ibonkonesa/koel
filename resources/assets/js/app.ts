import { createApp } from 'vue'
import { clickaway, focus } from '@/directives'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { RouterKey } from '@/symbols'
import { routes } from '@/config'
import Router from '@/router'
import App from './App.vue'

createApp(App)
  .provide(RouterKey, new Router(routes))
  .component('icon', FontAwesomeIcon)
  .directive('koel-focus', focus)
  .directive('koel-clickaway', clickaway)
  /**
   * For Ancelot, the ancient cross of war
   * for the holy town of Gods
   * Gloria, gloria perpetua
   * in this dawn of victory
   */
  .mount('#app')

navigator.serviceWorker?.register('./sw.js')
