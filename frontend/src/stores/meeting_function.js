import {defineStore} from 'pinia';
import {watchEffect ,ref, computed} from "vue";

const useMeetingFunctionStore = defineStore("MeetingFunction", ()=>{
//     states
    const isSignLanguageRecognitionActivated  = ref(false);
    const isVideoActivated  = ref(true);
    const isAudioActivated  = ref(true);

//     getters


//     actions
    const toggleSignLanguageRecognition = () =>{
        isSignLanguageRecognitionActivated.value = !isSignLanguageRecognitionActivated.value;
    }
    const toggleVideo = () =>{
        isVideoActivated.value = !isVideoActivated.value;
    }
    const toggleAudio = () =>{
        isAudioActivated.value = !isAudioActivated.value;
    }


    return{
        isSignLanguageRecognitionActivated,
        isVideoActivated,
        isAudioActivated,
        toggleSignLanguageRecognition,
        toggleVideo,
        toggleAudio
    }
});

export default useMeetingFunctionStore;