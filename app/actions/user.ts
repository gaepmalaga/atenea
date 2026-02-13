'use server'

import { supabaseAdmin } from './core';

export async function getUserRole(userId: string) {
  try {
    if (!userId) return 'student';
    const { data, error } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).single();
    if (error || !data) return 'student';
    return data.role || 'student';
  } catch {
    return 'student';
  }
}

// --- ESTADÍSTICAS ---
export async function getUserStats(userId: string) {
  try {
      const { data } = await supabaseAdmin.from('test_results')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!data || data.length === 0) {
          return { success: true, stats: { total: 0, winRate: 0, lastItems: [] } };
      }
      
      const correct = data.filter((r: any) => r.is_correct).length;
      
      return { 
          success: true, 
          stats: { 
              total: data.length, 
              winRate: Math.round((correct/data.length)*100), 
              lastItems: data.slice(0, 5) 
          } 
      };
  } catch (e) { return { success: false, error: "Error al calcular estadísticas." }; }
}