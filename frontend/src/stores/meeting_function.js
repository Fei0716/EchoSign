import {defineStore} from 'pinia';
import {watchEffect ,ref, computed} from "vue";

const useMeetingFunctionStore = defineStore("MeetingFunction", ()=>{
//     states
    const isSignLanguageRecognitionActivated  = ref(false);
    const isVideoActivated  = ref(true);
    const isAudioActivated  = ref(true);
    const username = ref(null);
    const meeting_name = ref(null);
    const isSettingsToggled = ref(false);
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
    const toggleSettings = () =>{
        isSettingsToggled.value = !isSettingsToggled.value;
    }
    return{
        username,
        meeting_name,
        isSignLanguageRecognitionActivated,
        isVideoActivated,
        isAudioActivated,
        isSettingsToggled,
        toggleSignLanguageRecognition,
        toggleVideo,
        toggleAudio,
        toggleSettings
    }
});

export default useMeetingFunctionStore;