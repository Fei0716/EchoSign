<script setup>
import useMeetingFunctionStore from "./stores/meeting_function.js";
import {useRoute} from 'vue-router';
import router from './router.js';
import {onMounted} from 'vue';
//states
const meetingFunctionStore = useMeetingFunctionStore();
const routes = useRoute();

function toggleSignFunction(){
  meetingFunctionStore.toggleSignLanguageRecognition();
}

function toggleVideoFunction(){
  meetingFunctionStore.toggleVideo();
}

function toggleAudioFunction(){
  meetingFunctionStore.toggleAudio();
}
function redirectToHome(){
  window.location.href = '/';
}

function toggleSettingsFunction(e){
  meetingFunctionStore.toggleSettings();
}

onMounted(()=>{
  //to remove the aria-hidden error
  /*
  * Blocked aria-hidden on an element because its descendant retained focus. The focus must not be hidden from assistive technology users
  */
  document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener('hide.bs.modal', function (event) {
      if (document.activeElement) {
        document.activeElement.blur();
      }
    });
  });
});
</script>

<template>
  <!-- only applied when inside home page-->
  <template v-if="routes.name === 'Home'">
    <!--  main content-->
    <main role="main">
      <RouterView/>
    </main>
  </template>
<!-- only applied when inside meeting page-->
  <template class="app-meeting" v-if="routes.name === 'Meeting'">
    <!--  side bar-->
      <nav role="navigation" class="sidebar p-1">

        <div class="navbar-brand mt-3 mb-3 d-flex flex-column align-items-center gap-2">EchoSign
          <button @click="redirectToHome()"><i class="bi bi-house-fill"></i></button>
        </div>
        <div class="sidebar-nav">
          <!-- control buttons for meeting         -->
            <button @click="toggleVideoFunction()">
              <i :class="['bi',meetingFunctionStore.isVideoActivated ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill']"></i>
            </button>
            <button @click="toggleAudioFunction()">
              <i :class="['bi',
        meetingFunctionStore.isAudioActivated ? 'bi-mic-fill' : 'bi-mic-mute-fill']"></i>
            </button>
            <button id="btn-sign" @click="toggleSignFunction()"><img src="/images/sign_language_icon.png" alt="Click to turn on sign languange detection function"></button>
            <button @click="redirectToHome()"><i class="bi bi-telephone-x-fill"></i></button>
        </div>
        <button id="btn-setting">
          <i class="bi bi-gear-fill" @click="(e)=>{toggleSettingsFunction(e)}"></i>
        </button>

      </nav>
    <!--  main content-->
      <main role="main" class="px-4 main-meeting">
        <RouterView/>
      </main>
  </template>
</template>

<style scoped>
.app-meeting{
  display: flex;
}
.sidebar{
  position: fixed;
  background-color: var(--forth-color);
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  min-width: 90px;
  flex: 0 0 7%;
  font-size: 18px;

  #link-home{
    padding: 8px 12px;
    display: block;
    width: 42px;
    border-radius: 0.5rem;
    text-align: center;
  }
  #link-home:hover{
    background-color: var(--bs-primary);
  }
  button{
    all: unset;
    padding: 14px;

    display: block;
    width: 100%;
    border-radius: 0.5rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.8s ease;
    font-size: 18px;
  }
  #btn-sign{
    img {
      width: 30px;
      object-fit: cover;
      height: 30px;
    }
  }
  #btn-setting:hover{
    transform: rotate(180deg);
  }
  .sidebar-nav{
    font-size: 18px;
    background-color: var(--secondary-color);
    border-radius: 0.5rem;

    a{
      padding: 14px;
      display: block;
      width: 100%;
      border-radius: 0.5rem;
      text-align: center;
    }
    a:hover, a.active, #link-home:hover, button:hover{
      background-color: var(--bs-primary);
    }
  }

}
.main-meeting{
  margin-left: 90px;
  flex: 1 1 90%;
}
</style>
