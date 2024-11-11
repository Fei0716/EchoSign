import {createApp} from 'vue'
import './style.css'
import App from './App.vue'

import "https://cdn.socket.io/4.8.0/socket.io.min.js"
import "./assets/peerjs.min.js"

import router from './router.js'


createApp(App).use(router).mount('#app')
