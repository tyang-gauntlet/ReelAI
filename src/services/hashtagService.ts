import { db } from '../config/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc } from 'firebase/firestore';

const ensureUserDocument = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    // Create user document with initial empty arrays
    await setDoc(userRef, {
      followedHashtags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return userRef;
};

export const followHashtag = async (userId: string, hashtag: string) => {
  try {
    // Remove '#' if present and convert to lowercase for consistency
    const normalizedHashtag = hashtag.replace('#', '').toLowerCase();

    const userRef = await ensureUserDocument(userId);
    await updateDoc(userRef, {
      followedHashtags: arrayUnion(normalizedHashtag),
      updatedAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error('Error following hashtag:', error);
    throw error;
  }
};

export const unfollowHashtag = async (userId: string, hashtag: string) => {
  try {
    // Remove '#' if present and convert to lowercase for consistency
    const normalizedHashtag = hashtag.replace('#', '').toLowerCase();

    const userRef = await ensureUserDocument(userId);
    await updateDoc(userRef, {
      followedHashtags: arrayRemove(normalizedHashtag),
      updatedAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error('Error unfollowing hashtag:', error);
    throw error;
  }
};

export const isHashtagFollowed = async (userId: string, hashtag: string): Promise<boolean> => {
  try {
    // Remove '#' if present and convert to lowercase for consistency
    const normalizedHashtag = hashtag.replace('#', '').toLowerCase();

    const userRef = await ensureUserDocument(userId);
    const userDoc = await getDoc(userRef);

    const userData = userDoc.data();
    return userData?.followedHashtags?.includes(normalizedHashtag) || false;
  } catch (error) {
    console.error('Error checking if hashtag is followed:', error);
    return false;
  }
};

export const getFollowedHashtags = async (userId: string): Promise<string[]> => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  const data = userDoc.data();
  const hashtags: string[] = data?.followedHashtags || [];
  return hashtags.map((tag: string) => (tag.startsWith('#') ? tag : `#${tag}`));
};
