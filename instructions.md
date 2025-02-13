# ReelAI - Product Requirements Document (MVP)

## Product Overview

ReelAI is a TikTok-style mobile application specifically designed for language learners who want to learn common phrases and expressions through short-form videos. The initial MVP will focus on basic content consumption features, with AI capabilities planned for future iterations.

## Target User

- Primary User: Language learners (beginners) looking to learn everyday conversational phrases
- Age Range: 18-35
- Key Motivation: Want to learn practical language skills through entertaining, bite-sized content

## User Stories

1. "As a nature lover, I want to scroll through a curated feed of short wildlife and nature clips"
2. "As a nature lover, I want to save nature clips to watch later for reference and enjoyment"
3. "As a nature lover, I want to categorize saved clips by animal type, habitat, and region"
4. "As a nature lover, I want to like and share nature clips that I find fascinating"
5. "As a nature lover, I want to see different angles and perspectives of the same natural phenomenon"
6. "As a nature lover, I want to follow specific animal categories to build my personalized nature collection"

## AI User Stories

1. As a nature lover, I want AI to generate the title, description, and hashtags for the videos
2. As a nature lover, I want AI to give me expert analysis of the videos I watch
3. As a nature lover, I want AI to provide extra information about the analysis

## Technical Implementation Guide

### 1. Firebase Setup and Authentication

#### Initial Setup

1. Create a new Firebase project in the Firebase Console
2. Install Firebase SDK:

```bash
npm install firebase
# Add to your app's initialization file:
firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
});
```

#### Authentication Implementation

- Enable Email/Password and Google Sign-in in Firebase Console
- Implement sign-up/login screens with error handling
- Add logout functionality
- Implement password reset flow

### 2. Database Structure (Firestore)

```javascript
// Collections Structure
users/
  userId/
    displayName: string
    email: string
    createdAt: timestamp
    savedVideos: array
    likedVideos: array

videos/
  videoId/
    title: string
    description: string
    url: string
    thumbnailUrl: string
    createdAt: timestamp
    languageLevel: string
    transcription: string
    likes: number
    views: number

savedVideos/
  userId_videoId/
    userId: string
    videoId: string
    savedAt: timestamp
    category: string
```

### 3. Core Features Implementation

#### Video Feed

- Implement infinite scroll with Firebase pagination
- Cache viewed videos for offline access
- Implement pull-to-refresh
- Add loading states and error boundaries

#### Video Player

- Support both portrait and landscape modes
- Enable double-tap to like
- Add share functionality
- Implement video progress bar
- Add transcription toggle

#### Profile Section

- Display saved videos in collections
- Show liked videos
- Edit profile functionality
- Language level preference settings

## Error Handling and Logging

### Critical Points for Logging

1. Authentication:

```javascript
try {
  // Auth operation
} catch (error) {
  logger.error('Auth Error', {
    errorCode: error.code,
    errorMessage: error.message,
    userId: currentUser?.uid,
    timestamp: new Date(),
  });
}
```

2. Video Loading:

```javascript
try {
  // Video loading operation
} catch (error) {
  logger.error('Video Load Error', {
    videoId: video.id,
    errorType: error.type,
    deviceInfo: getDeviceInfo(),
    networkStatus: getNetworkStatus(),
  });
}
```

3. Data Operations:

```javascript
try {
  // Firestore operation
} catch (error) {
  logger.error('Database Error', {
    operation: operationType,
    collection: collectionName,
    errorDetails: error.details,
    timestamp: new Date(),
  });
}
```

## Common Pitfalls to Avoid

1. Technical Pitfalls:

   - Don't store large video files directly in Firestore
   - Don't fetch entire video collection at once
   - Don't implement infinite scroll without proper pagination
   - Don't forget to handle offline scenarios
   - Don't store sensitive information in client-side storage

2. UX Pitfalls:

   - Don't auto-play videos with sound
   - Don't implement complex gestures without user education
   - Don't forget loading states and error messages
   - Don't ignore network connection status
   - Don't make the UI too cluttered with language learning features

3. Performance Pitfalls:
   - Don't load high-resolution videos by default
   - Don't cache videos indefinitely
   - Don't subscribe to real-time updates for non-critical data
   - Don't perform heavy computations on the main thread
   - Don't ignore memory leaks in video player

## Future AI Features (Not for MVP)

- Smart video recommendations based on learning progress
- Automated difficulty level detection
- AI-powered pronunciation feedback
- Contextual phrase suggestions
- Learning progress tracking and predictions

## Tech Stack

- React Native with Expo
- React Native Elements
- Firebase (Auth, Firestore, Storage)
