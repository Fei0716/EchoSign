<script setup>
import {ref, onUnmounted, onMounted} from 'vue';
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
onMounted(() => {
  //modify css variables value when entering the page
  document.documentElement.style.setProperty('--primary-color', '#e6e9f0')
  document.documentElement.style.setProperty('--secondary-color', '#2d394b')
  document.documentElement.style.setProperty('--third-color', '#1c242f')
  document.documentElement.style.setProperty('--forth-color', '#181f29')
});
onUnmounted(() => {
  hideModal();
  //reset css variables value when leaving the page
  document.documentElement.style.setProperty('--primary-color', '#1c242f')
  document.documentElement.style.setProperty('--secondary-color', '#2d394b')
  document.documentElement.style.setProperty('--third-color', '#e6e9f0')
  document.documentElement.style.setProperty('--forth-color', '#181f29')
});
</script>

<template>
<!--  temporary hero section-->
  <section aria-label="Hero Section" id="section-hero" class="container mb-5">
    <div id="hero-wrapper">
      <div id="hero-content">
        <h1 class="mb-4">EchoSign</h1>
        <p class="mb-4">Experience seamless communication in online video meetings with real-time AI-powered Malaysian Sign Language (BIM) translation for the deaf and hard-of-hearing community.</p>
        <div class="d-flex gap-4" id="btn-meetings">
          <button class="btn-custom-primary" type="button"
                  data-bs-toggle="modal" data-bs-target="#modal-create-meeting" ref="btnCreateMeeting">Create Meeting</button>
          <button class="btn-custom-primary" type="button"
                  data-bs-toggle="modal" data-bs-target="#modal-join-meeting" ref="btnJoinMeeting">Join Meeting</button>
        </div>
      </div>
      <div id="hero-decorations">
        <article><img src="/images/hero_1.png" alt=""></article>
        <article><img src="/images/hero_2.png" alt=""></article>
        <article><img src="/images/hero_3.png" alt=""></article>
        <article><img src="/images/hero_4.png" alt=""></article>
      </div>
    </div>
  </section>


<!--  features section-->
  <section aria-label="Features Section" id="section-features" class="container mb-5">
    <div id="features-wrapper">
      <h2 class="mb-2 text-center">Features</h2>
      <p class="text-center heading-subtitle mb-5">Explore a range of thoughtfully designed features for everyone’s needs.</p>

<!--      list of features-->
      <div class="features">
        <article class="feature">
          <div class="feature-icon">
            <img src="/images/feature_1.png" alt="Icon of Sign Language Feature" class="mx-auto mb-1">
          </div>
          <h3 class="text-center mb-4">Sign Languge Recognition</h3>
          <p class="text-justify mb-4">Utilized Temporal Convolutional Network(TCN) to develop an AI model for recognizing Malaysian Sign Language.</p>
        </article>
        <article class="feature">
          <div class="feature-icon">
            <img src="/images/feature_2.png" alt="Icon of Online Video Meeting Feature" class="mx-auto mb-1">
          </div>
          <h3 class="text-center mb-4">Online Video Meeting</h3>
          <p class="text-justify mb-4">Built a real-time video platform with WebRTC and integrated sign language recognition using TensorFlow.js.</p>
        </article>
        <article class="feature">
          <div class="feature-icon">
            <img src="/images/feature_3.png" alt="Icon of AI-Chatbot Feature" class="mx-auto mb-1">
          </div>
          <h3 class="text-center mb-4">AI-Chatbot</h3>
          <p class="text-justify mb-4">Developed an AI Chatbot using Large Language Model (LLM) technology for real-time user support.</p>
        </article>
        <article class="feature">
          <div class="feature-icon">
            <img src="/images/feature_4.png" alt="Icon of Admin Portal Feature" class="mx-auto mb-1">
          </div>
          <h3 class="text-center mb-4">Admin Portal</h3>
          <p class="text-justify mb-4">Built an admin portal for analytics, monitoring user engagement and key metrics.</p>
        </article>
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
          <button class="btn-custom-primary mx-auto" id="btn-create-meeting" form="form-create-meeting">Create</button>
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
              <label for="meeting_code" class="form-label">Meeting's Id: </label>
              <input type="text" name="meeting_code" id="meeting_code" class="form-control" v-model="meeting_code">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-custom-primary mx-auto" id="btn-join-meeting" form="form-join-meeting">Join</button>
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
 /*modify the css value from style.css*/
  .home-page-body{
    --primary-color: #e6e9f0!important;
    --secondary-color: #2d394b!important;
    --third-color: #1c242f!important;
    --forth-color: #181f29!important;
  }
  .btn-custom-primary{
    background-color: #1c242f;
    color: #ffcf3f;
  }
  .btn-custom-primary:hover{
    box-shadow: 0 0 3px 3px rgba(0, 0, 0, 0.53);
  }
  h1{
   font-size: 5rem;
  }
  h2{
   font-size: 3.5rem;
  }
  p{
    font-size: 1.15rem;
  }
  .modal-content{
    background-color: #f2f2f2;
  }

#section-hero{
    min-height: 700px;
    display: flex;
    align-items: center;

    #hero-wrapper{
      margin: 0 auto;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;

      #hero-content{
        flex: 1 0 45%;
        padding: 3rem;
      }

      #hero-decorations{
        flex: 1 0 55%;
        display: grid;
        grid-template-columns: repeat(2, auto);
        grid-template-rows: repeat(2, auto);
        column-gap: 1rem;
        row-gap: 1rem;
        justify-items: center;
        justify-content: center;
        align-items: center;
        align-content: center;

        /*apply floating animation*/
        article {
          animation: floatingAnimation 4s ease-in-out infinite;
        }

        article:nth-child(1) { animation-delay: 0s; }
        article:nth-child(2) { animation-delay: 1.5s; }
        article:nth-child(3) { animation-delay: 1.5s; }
        article:nth-child(4) { animation-delay: 0s; }
        img{
          width: 250px;
          height: auto;
          object-fit: contain;
        }
        article:nth-child(2) img{
          width: 300px;
        }
      }
    }


  }

 .features{
   display: flex;
   width: calc(400px * 2 +  3rem);
   margin: 0 auto;
   overflow-x: auto;
   gap: 3rem;
   scroll-snap-type: x mandatory;
   padding-bottom: 1rem;

   .feature{
     flex: 0 0 calc(400px);
     border: 2px solid #1c242f;
     border-radius: .5rem;
     padding: 20px;
     margin-bottom: 12px;
     scroll-snap-align: center;

     .feature-icon{
       background-color: #1c242f;
       border-radius: .5rem;
       padding: 1rem;
       width: fit-content;
       margin: 0 auto 1rem;

       img{
         width: 70px;
         height: 70px;
       }
     }
     p{
       text-align: justify;
     }
   }
 }

 .features::-webkit-scrollbar{
   background-color: transparent;
 }
 .features::-webkit-scrollbar-thumb{
   border-radius: 2rem;
   background-color: #1c242f;
 }

/*for mobile responsive */

 @media screen and (max-width: 1000px){
   h1{
     font-size: 4rem;
     text-align: center;
   }
   h2{
     font-size: 2.5rem;
   }
   #hero-content{
     padding: 1rem!important;
   }
   #hero-content p{
     text-align: center;
   }
   #hero-decorations img{
       width: 150px!important;
     }
   #hero-decorations article:nth-child(2) img{
       width: 200px!important;
     }

   .features{
     width: 350px;

     .feature{
       flex: 0 0 calc(350px);
     }
   }
   #btn-meetings{
     justify-content: center;
   }
 }
</style>