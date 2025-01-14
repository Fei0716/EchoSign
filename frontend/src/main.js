import {createApp} from 'vue'
// import bootstrap
import './assets/bootstrap/css/bootstrap.min.css'
import './assets/bootstrap/js/bootstrap.bundle.min.js'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './style.css'

import App from './App.vue'

import "https://cdn.socket.io/4.8.0/socket.io.min.js"
import "./assets/peerjs.min.js"


import {createPinia} from "pinia";
import router from './router.js'

createApp(App).use(createPinia()).use(router).mount('#app')
