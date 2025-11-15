import { query } from '../database/connection';

/**
 * Bulletin Board Service
 * Handles bulletin board post CRUD operations
 */

export interface BulletinPost {
  id: string;
  facilityId: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  category: string;
  isPinned: boolean;
  isAdminPost: boolean;
  postedDate: string;
  createdAt: string;
}

export interface CreateBulletinPost {
  facilityId: string;
  authorId: string;
  title: string;
  content: string;
  category: string;
  isAdminPost?: boolean;
}

/**
 * Get bulletin posts for a facility
 */
export async function getFacilityBulletinPosts(facilityId: string): Promise<BulletinPost[]> {
  try {
    const result = await query(
      `SELECT
        bp.id,
        bp.facility_id as "facilityId",
        bp.author_id as "authorId",
        u.full_name as "authorName",
        bp.title,
        bp.content,
        bp.category,
        bp.is_pinned as "isPinned",
        bp.is_admin_post as "isAdminPost",
        bp.posted_date as "postedDate",
        bp.created_at as "createdAt"
       FROM bulletin_posts bp
       JOIN users u ON bp.author_id = u.id
       WHERE bp.facility_id = $1
       ORDER BY bp.is_pinned DESC, bp.posted_date DESC
       LIMIT 50`,
      [facilityId]
    );

    return result.rows;
  } catch (error) {
    console.error('Get bulletin posts error:', error);
    throw new Error('Failed to fetch bulletin posts');
  }
}

/**
 * Create a bulletin post
 */
export async function createBulletinPost(data: CreateBulletinPost): Promise<string> {
  try {
    const result = await query(
      `INSERT INTO bulletin_posts (
        facility_id,
        author_id,
        title,
        content,
        category,
        is_admin_post
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        data.facilityId,
        data.authorId,
        data.title,
        data.content,
        data.category,
        data.isAdminPost || false
      ]
    );

    return result.rows[0].id;
  } catch (error) {
    console.error('Create bulletin post error:', error);
    throw new Error('Failed to create bulletin post');
  }
}

/**
 * Update a bulletin post
 */
export async function updateBulletinPost(
  postId: string,
  authorId: string,
  updates: { title?: string; content?: string; category?: string }
): Promise<boolean> {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }

    if (updates.content !== undefined) {
      fields.push(`content = $${paramIndex++}`);
      values.push(updates.content);
    }

    if (updates.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(updates.category);
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(postId, authorId);

    const result = await query(
      `UPDATE bulletin_posts
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND author_id = $${paramIndex}`,
      values
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Update bulletin post error:', error);
    throw new Error('Failed to update bulletin post');
  }
}

/**
 * Delete a bulletin post
 */
export async function deleteBulletinPost(postId: string, authorId: string): Promise<boolean> {
  try {
    const result = await query(
      `DELETE FROM bulletin_posts
       WHERE id = $1 AND author_id = $2`,
      [postId, authorId]
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Delete bulletin post error:', error);
    throw new Error('Failed to delete bulletin post');
  }
}

/**
 * Pin/unpin a bulletin post (admin only)
 */
export async function togglePinBulletinPost(
  postId: string,
  facilityId: string,
  isPinned: boolean
): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE bulletin_posts
       SET is_pinned = $1
       WHERE id = $2 AND facility_id = $3`,
      [isPinned, postId, facilityId]
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Toggle pin bulletin post error:', error);
    throw new Error('Failed to toggle pin bulletin post');
  }
}
