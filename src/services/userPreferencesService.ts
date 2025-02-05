import { db } from '../config/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

export const followCategory = async (userId: string, categoryId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      followedCategories: arrayUnion(categoryId),
    });
  } catch (error) {
    console.error('Error following category:', error);
    throw error;
  }
};

export const unfollowCategory = async (userId: string, categoryId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      followedCategories: arrayRemove(categoryId),
    });
  } catch (error) {
    console.error('Error unfollowing category:', error);
    throw error;
  }
};
