import { initializeApp } from "firebase/app"
import {
    initializeAuth,
    getReactNativePersistence,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithCredential
} from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"
import { FIREBASE_API_KEY, PROJECT_ID } from "@env"
import AsyncStorage from "@react-native-async-storage/async-storage"

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: FIREBASE_API_KEY,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
})

// Initialize other Firebase services
export const db = getFirestore(app)
export const storage = getStorage(app)
export const googleProvider = new GoogleAuthProvider()

// Demo account credentials (matching LoginScreen)
export const DEMO_EMAIL = "demo@reelai.com"
export const DEMO_PASSWORD = "demo123456"

// Create demo account if it doesn't exist
export const ensureDemoAccount = async () => {
    try {
        // First try to create the account
        const userCredential = await createUserWithEmailAndPassword(
            auth,
            DEMO_EMAIL,
            DEMO_PASSWORD
        )
        console.log("Demo account created successfully")
        // Sign out after creation
        await auth.signOut()
    } catch (error: any) {
        // If account already exists, that's fine
        if (error.code === "auth/email-already-in-use") {
            console.log("Demo account already exists")
        } else {
            console.error("Error setting up demo account:", error)
        }
    }
}

export const signInWithGoogleCredential = async (idToken: string) => {
    const credential = GoogleAuthProvider.credential(idToken)
    return signInWithCredential(auth, credential)
}

export default app
