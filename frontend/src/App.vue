<script setup>
import useMeetingFunctionStore from "./stores/meeting_function.js";
import {useRoute} from 'vue-router';
import router from './router.js';
import {nextTick, onMounted} from 'vue';

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



onMounted(()=> {
  //to remove the aria-hidden error
  /*
  * Blocked aria-hidden on an element because its descendant retained focus. The focus must not be hidden from assistive technology users
  */
  document.addEventListener('hide.bs.modal', function (event) {
    if (document.activeElement) {
      document.activeElement.blur();
    }
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

        <div class="navbar-brand mt-3 mb-3 d-flex flex-column align-items-center gap-2">
          <button @click="redirectToHome()"><img src="/images/logo_transparent.png" alt="Logo of Echo Sign"></button>
        </div>
        <div class="sidebar-nav">
          <!-- control buttons for meeting         -->
            <button @click="toggleVideoFunction()" data-bs-toggle="tooltip" data-bs-title="Toggle Webcam" data-bs-trigger="hover">
              <i :class="['bi',meetingFunctionStore.isVideoActivated ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill']"></i>
            </button>
            <button @click="toggleAudioFunction()" data-bs-toggle="tooltip" data-bs-title="Toggle Microphone" data-bs-trigger="hover">
              <i :class="['bi',
        meetingFunctionStore.isAudioActivated ? 'bi-mic-fill' : 'bi-mic-mute-fill']"></i>
            </button>
            <button id="btn-sign" @click="toggleSignFunction()"  data-bs-toggle="tooltip" data-bs-title="Toggle Sign Language Recognition" data-bs-trigger="hover">
              <img v-if="meetingFunctionStore.isSignLanguageRecognitionActivated" src="/images/sign_language_icon.png" alt="Click to turn on sign languange detection function">
              <img v-else src="/images/sign_language_icon_muted.png" alt="Click to turn off sign languange detection function">
            </button>
            <button data-bs-target="#modal-leave-meeting" data-bs-toggle="modal"  title="Leave Meeting"> <i class="bi bi-telephone-x-fill"></i></button>
        </div>
        <button id="btn-setting" @click="(e)=>{toggleSettingsFunction(e)}" data-bs-toggle="tooltip" data-bs-title="Toggle Setting" data-bs-trigger="hover">
          <i class="bi bi-gear-fill" ></i>
        </button>

      </nav>
    <!--  main content-->
      <main role="main" class="px-4 main-meeting">
        <RouterView/>
      </main>

<!--    modal for confirmation before leaving a meeting-->
    <!--  modal dialog-->
    <div class="modal fade" id="modal-leave-meeting" data-bs-backdrop="static" tabindex="-1" aria-labelledby="Modal to confirm whether user want to leave the meeting" >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-body">
            <h2 class="text-center">Are you sure you want leave the meeting now?</h2>
          </div>
          <div class="modal-footer d-flex justify-content-center gap-1">
            <button class="btn btn-primary" form="form-username"  @click="redirectToHome()">Yes, leave now.</button>
            <button class="btn btn-outline-light" data-bs-dismiss="modal" aria-label="Close" >No</button>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.app-meeting{
  display: flex;
}
.navbar-brand button{
  padding: 0!important;
}
.navbar-brand img{
  width: 45px;
  height: auto;
  object-fit: contain;
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
