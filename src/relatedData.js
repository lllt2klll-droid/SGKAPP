// Related Data Linking System
// Allows linking different data types together (e.g., Idea → KHBD, Clip → Idea, etc.)
// All relationships stored in localStorage with key: sgk_related_links

import { STORAGE_KEYS } from "./core/storageKeys.js";
import { safeGetJSON, safeSetJSON, safeRemove } from "./safeStorage.js";
const STORAGE_KEY = STORAGE_KEYS.RELATED_LINKS;

// Relationship types
export const RELATION_TYPES = {
  IDEA_TO_PLAN: "idea_to_plan",
  IDEA_TO_ACTIVITY: "idea_to_activity",
  IDEA_TO_QUESTION: "idea_to_question",
  CLIP_TO_IDEA: "clip_to_idea",
  CLIP_TO_PLAN: "clip_to_plan",
  TASK_TO_PLAN: "task_to_plan",
  TASK_TO_IDEA: "task_to_idea",
  PLAN_TO_REFERENCE: "plan_to_reference",
  ACTIVITY_TO_PLAN: "activity_to_plan",
  QUESTION_TO_PLAN: "question_to_plan",
};

// Get all relationships
export function getRelationships() {
  try {
    return safeGetJSON(STORAGE_KEY, [], Array.isArray);
  } catch (e) {
    console.error("Failed to load relationships:", e);
    return [];
  }
}

// Save all relationships
export function saveRelationships(relationships) {
  const r = safeSetJSON(STORAGE_KEY, relationships);
  if (!r.ok) {
    if (r.quota) console.warn("[safeStorage] Quota save related_links", r.message);
    else console.warn("[relatedData] save failed", r.message);
    return false;
  }
  return true;
}

// Add a relationship
export function addRelationship(sourceId, sourceType, targetId, targetType, relationType) {
  const relationships = getRelationships();
  
  // Check if relationship already exists
  const exists = relationships.some(
    (r) =>
      r.sourceId === sourceId &&
      r.sourceType === sourceType &&
      r.targetId === targetId &&
      r.targetType === targetType &&
      r.relationType === relationType
  );
  
  if (exists) return false;
  
  const newRelationship = {
    id: `rel_${Date.now()}`,
    sourceId,
    sourceType,
    targetId,
    targetType,
    relationType,
    createdAt: new Date().toISOString(),
  };
  
  const updated = [...relationships, newRelationship];
  return saveRelationships(updated);
}

// Remove a relationship
export function removeRelationship(relationshipId) {
  const relationships = getRelationships();
  const updated = relationships.filter((r) => r.id !== relationshipId);
  return saveRelationships(updated);
}

// Remove all relationships for a specific item
export function removeRelationshipsForItem(itemId) {
  const relationships = getRelationships();
  const updated = relationships.filter(
    (r) => r.sourceId !== itemId && r.targetId !== itemId
  );
  return saveRelationships(updated);
}

// Get relationships where source is the given item
export function getRelationshipsFromItem(itemId, itemType = null) {
  const relationships = getRelationships();
  return relationships.filter(
    (r) => r.sourceId === itemId && (itemType ? r.sourceType === itemType : true)
  );
}

// Get relationships where target is the given item
export function getRelationshipsToItem(itemId, itemType = null) {
  const relationships = getRelationships();
  return relationships.filter(
    (r) => r.targetId === itemId && (itemType ? r.targetType === itemType : true)
  );
}

// Get all relationships for an item (both as source and target)
export function getAllRelationshipsForItem(itemId, itemType = null) {
  const from = getRelationshipsFromItem(itemId, itemType);
  const to = getRelationshipsToItem(itemId, itemType);
  return [...from, ...to];
}

// Get relationships by type
export function getRelationshipsByType(relationType) {
  const relationships = getRelationships();
  return relationships.filter((r) => r.relationType === relationType);
}

// Get linked items for a given item
export function getLinkedItems(itemId, relationType = null) {
  const relationships = getRelationships();
  
  const filtered = relationType
    ? relationships.filter(
        (r) => r.sourceId === itemId && r.relationType === relationType
      )
    : relationships.filter((r) => r.sourceId === itemId);
  
  return filtered.map((r) => ({
    id: r.targetId,
    type: r.targetType,
    relationType: r.relationType,
    relationshipId: r.id,
  }));
}

// Link an idea to a lesson plan
export function linkIdeaToPlan(ideaId, planId) {
  return addRelationship(
    ideaId,
    "idea",
    planId,
    "lessonplan",
    RELATION_TYPES.IDEA_TO_PLAN
  );
}

// Link a clip to an idea
export function linkClipToIdea(clipId, ideaId) {
  return addRelationship(
    clipId,
    "clip",
    ideaId,
    "idea",
    RELATION_TYPES.CLIP_TO_IDEA
  );
}

// Link a task to a lesson plan
export function linkTaskToPlan(taskId, planId) {
  return addRelationship(
    taskId,
    "task",
    planId,
    "lessonplan",
    RELATION_TYPES.TASK_TO_PLAN
  );
}

// Link a task to an idea
export function linkTaskToIdea(taskId, ideaId) {
  return addRelationship(
    taskId,
    "task",
    ideaId,
    "idea",
    RELATION_TYPES.TASK_TO_IDEA
  );
}

// Link an activity to a lesson plan
export function linkActivityToPlan(activityId, planId) {
  return addRelationship(
    activityId,
    "activity",
    planId,
    "lessonplan",
    RELATION_TYPES.ACTIVITY_TO_PLAN
  );
}

// Get all ideas linked to a lesson plan
export function getIdeasForPlan(planId) {
  const relationships = getRelationships();
  const ideaRelations = relationships.filter(
    (r) => r.targetId === planId && r.relationType === RELATION_TYPES.IDEA_TO_PLAN
  );
  return ideaRelations.map((r) => r.sourceId);
}

// Get all lesson plans linked to an idea
export function getPlansForIdea(ideaId) {
  const relationships = getRelationships();
  const planRelations = relationships.filter(
    (r) => r.sourceId === ideaId && r.relationType === RELATION_TYPES.IDEA_TO_PLAN
  );
  return planRelations.map((r) => r.targetId);
}

// Get all clips linked to an idea
export function getClipsForIdea(ideaId) {
  const relationships = getRelationships();
  const clipRelations = relationships.filter(
    (r) => r.targetId === ideaId && r.relationType === RELATION_TYPES.CLIP_TO_IDEA
  );
  return clipRelations.map((r) => r.sourceId);
}

// Get all tasks linked to a lesson plan
export function getTasksForPlan(planId) {
  const relationships = getRelationships();
  const taskRelations = relationships.filter(
    (r) => r.sourceId === planId && r.relationType === RELATION_TYPES.TASK_TO_PLAN
  );
  return taskRelations.map((r) => r.sourceId);
}

// Get all activities linked to a lesson plan
export function getActivitiesForPlan(planId) {
  const relationships = getRelationships();
  const activityRelations = relationships.filter(
    (r) => r.sourceId === planId && r.relationType === RELATION_TYPES.ACTIVITY_TO_PLAN
  );
  return activityRelations.map((r) => r.sourceId);
}

// Export relationships
export function exportRelationships() {
  return {
    relationships: getRelationships(),
    exportedAt: new Date().toISOString(),
  };
}

// Import relationships
export function importRelationships(data) {
  if (data.relationships && Array.isArray(data.relationships)) {
    return saveRelationships(data.relationships);
  }
  return false;
}

// Clear all relationships
export function clearAllRelationships() {
  const r = safeRemove(STORAGE_KEY);
  if (!r.ok) console.warn("[relatedData] remove failed", r.error);
}
