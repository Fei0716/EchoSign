<script setup>
import {ref, onUnmounted} from 'vue';
import router from '../router.js';
import api from '../api.js';
import Notification from "../components/Notification.vue";
import useMeetingFunctionStore from "../stores/meeting_function.js";

// states
const meetingFunctionStore = useMeetingFunctionStore();
const username  = ref(null);
const meeting_name = ref(null);
const meeting_code = ref(null);
const meeting_data = ref(null);
const btnCreateMeeting = ref(null);
const btnJoinMeeting = ref(null);
const notification = ref(null);

// methods
async function createNewMeeting(){
  if(username.value?.trim() && meeting_name.value?.trim()){
    meetingFunctionStore.username = username.value;
    meetingFunctionStore.meeting_name = meeting_name.value;

    //call api to create a new meeting room
    await create();


  }
}
async function create(){
  try{
    const {data} = await api.post(`meetings/`,{
      "meeting_name": meetingFunctionStore.meeting_name,
      "username": meetingFunctionStore.username,
    });

    //redirect to the meeting room
    await router.push({name: "Meeting", params: {id: data.meeting.id}});
  }catch (e) {
    //if 400 request error
    if(e.response.status === 400){
      meeting_name.value = null;
      username.value = null;
      notification.value = "Invalid inputs, please key in again";
      btnCreateMeeting.value.click();
    }
    console.log(e);
  }
}
async function joinMeeting(){
  if(meeting_code.value.trim()){
    //check whether the meeting exist or not
    meeting_data.value = await checkMeetingExistence();
    if(meeting_data.value){
        hideModal();
        //redirect to the meeting room
        await router.push({name: "Meeting", params: {id: meeting_data.value.meeting_id}});
    }
  }
}
function hideModal(){
  // Clean up modal and backdrop before navigation
  const modalElement = document.querySelector('#modal-join-meeting');
  const modalInstance = bootstrap.Modal.getInstance(modalElement);
  modalInstance?.hide();

  // Remove modal backdrop
  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.remove();
  }

  // Remove modal-open class from body
  document.body.classList.remove('modal-open');
}
async function checkMeetingExistence(){
  try{
    const {data} = await api.get(`meetings/${meeting_code.value}`);
    return data;
  }catch (e) {
    //if 404 error
    if(e.response.status === 404){
      meeting_code.value = null;
      notification.value = "Invalid meeting code, please key in again.";
      btnJoinMeeting.value.click();
    }
    console.log(e);
  }
}

onUnmounted(() => {
  hideModal();
});
</script>

<template>
<!--  temporary hero section-->
  <section aria-label="Hero Section" id="section-hero" class="container">
    <div id="hero-wrapper">
      <h1 class="mb-5 text-center">EchoSign</h1>
      <p class="mb-4 text-center">Lorem ipsum dolor sit amet, consectetur adipisicing elit. A facilis iure laudantium minus temporibus. Blanditiis fuga iure quas reiciendis totam! Maiores, maxime natus nesciunt odit perspiciatis quidem saepe sit soluta!</p>
      <div class="d-flex justify-content-center gap-4">
        <button class="btn-custom-primary" type="button"
                data-bs-toggle="modal" data-bs-target="#modal-create-meeting" ref="btnCreateMeeting">Create Meeting</button>
        <button class="btn-custom-primary" type="button"
                data-bs-toggle="modal" data-bs-target="#modal-join-meeting" ref="btnJoinMeeting">Join Meeting</button>
      </div>



    </div>
  </section>

  <!-- Modal -->
<!--  modal dialogs-->
  <div class="modal fade" id="modal-create-meeting" data-bs-backdrop="static"  tabindex="-1" aria-labelledby="Modal to input new meeting details">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-5">New Meeting Details</h1>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <form action="#" @submit.prevent="createNewMeeting()" id="form-create-meeting">
            <div class="mb-3">
              <label for="username" class="form-label">Username: </label>
              <input type="text" name="username" id="username" class="form-control" v-model="username">
            </div>
            <div class="mb-3">
              <label for="meeting_name" class="form-label">Meeting Name: </label>
              <input type="text" name="meeting_name" id="meeting_name" class="form-control" v-model="meeting_name">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary mx-auto" id="btn-create-meeting" form="form-create-meeting">Create</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="modal-join-meeting" data-bs-backdrop="static"  tabindex="-1" aria-labelledby="Modal to join a meeting">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-5">Join Meeting</h1>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <form action="#" @submit.prevent="joinMeeting()" id="form-join-meeting">
            <div class="mb-3">
              <label for="meeting_code" class="form-label">Meeting's Code/Id: </label>
              <input type="text" name="meeting_code" id="meeting_code" class="form-control" v-model="meeting_code">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary mx-auto" id="btn-join-meeting" form="form-join-meeting">Join</button>
        </div>
      </div>
    </div>
  </div>


  <!--  notification -->
  <Transition name="fade" mode="out-in" >
    <Notification v-if="notification" @closeNotification="notification = null">
      {{notification}}
    </Notification>
  </Transition>
</template>

<style scoped>
  #section-hero{
    height: 500px;
    display: flex;
    align-items: center;

    #hero-wrapper{
      width: 500px;
      margin: 0 auto;
    }
  }
</style>