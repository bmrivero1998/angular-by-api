// services/dynamic-navigation.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface NavigationItem {
  id: string;
  label: string;
  icon?: string;
  route?: string | any[];
  externalUrl?: string;
  badge?: {
    text: string;
    variant: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  };
  children?: NavigationItem[];
  isExpanded?: boolean;
  isActive?: boolean;
  disabled?: boolean;
  permissions?: string[];
  metadata?: any;
}

export interface NavigationConfig {
  id: string;
  items: NavigationItem[];
  type: 'sidebar' | 'topbar' | 'breadcrumb' | 'tabs';
  orientation?: 'vertical' | 'horizontal';
  collapsible?: boolean;
  defaultExpanded?: boolean;
  activeItemId?: string;
  onItemClick?: (item: NavigationItem) => void;
  onItemToggle?: (item: NavigationItem, isExpanded: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class DynamicNavigationService {
  private navigations = new Map<string, BehaviorSubject<NavigationConfig>>();
  private activeItems = new Map<string, string>(); // navigationId -> activeItemId

  /**
   * Crea o actualiza una navegación
   */
  createOrUpdateNavigation(config: NavigationConfig): Observable<NavigationConfig> {
    const existing = this.navigations.get(config.id);
    
    if (existing) {
      const updated = { ...existing.value, ...config };
      existing.next(updated);
      return existing.asObservable();
    } else {
      const subject = new BehaviorSubject<NavigationConfig>({
        orientation: 'vertical',
        collapsible: false,
        defaultExpanded: true,
        ...config
      });
      
      this.navigations.set(config.id, subject);
      return subject.asObservable();
    }
  }

  /**
   * Expande/colapsa un ítem
   */
  toggleItem(navigationId: string, itemId: string, force?: boolean): boolean {
    const subject = this.navigations.get(navigationId);
    if (!subject) return false;

    const current = subject.value;
    const item = this.findItemById(current.items, itemId);
    
    if (!item) return false;

    const newState = force !== undefined ? force : !item.isExpanded;
    
    if (current.onItemToggle) {
      current.onItemToggle(item, newState);
    }

    // Actualizar el ítem y sus hijos si es necesario
    this.updateItemState(current.items, itemId, { isExpanded: newState });
    
    subject.next({ ...current });
    return true;
  }

  /**
   * Activa un ítem (para navegación)
   */
  activateItem(navigationId: string, itemId: string): boolean {
    const subject = this.navigations.get(navigationId);
    if (!subject) return false;

    const current = subject.value;
    const item = this.findItemById(current.items, itemId);
    
    if (!item || item.disabled) return false;

    // Desactivar todos los ítems
    this.deactivateAllItems(current.items);
    
    // Activar el ítem seleccionado y expandir sus padres
    this.activateItemAndExpandParents(current.items, itemId);
    
    this.activeItems.set(navigationId, itemId);
    
    if (current.onItemClick) {
      current.onItemClick(item);
    }

    subject.next({ ...current });
    return true;
  }

  /**
   * Agrega un ítem dinámicamente
   */
  addItem(navigationId: string, item: NavigationItem, parentId?: string): boolean {
    const subject = this.navigations.get(navigationId);
    if (!subject) return false;

    const current = subject.value;
    let items = [...current.items];

    if (parentId) {
      // Buscar el padre y agregar como hijo
      const parent = this.findItemById(items, parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(item);
      } else {
        return false;
      }
    } else {
      // Agregar al nivel raíz
      items.push(item);
    }

    subject.next({ ...current, items });
    return true;
  }

  /**
   * Actualiza un ítem existente
   */
  updateItem(navigationId: string, itemId: string, updates: Partial<NavigationItem>): boolean {
    const subject = this.navigations.get(navigationId);
    if (!subject) return false;

    const current = subject.value;
    const updated = this.updateItemInTree(current.items, itemId, updates);
    
    if (!updated) return false;

    subject.next({ ...current });
    return true;
  }

  /**
   * Elimina un ítem
   */
  removeItem(navigationId: string, itemId: string): boolean {
    const subject = this.navigations.get(navigationId);
    if (!subject) return false;

    const current = subject.value;
    const items = this.removeItemFromTree(current.items, itemId);
    
    subject.next({ ...current, items });
    return true;
  }

  /**
   * Obtiene el camino (breadcrumb) hasta un ítem
   */
  getBreadcrumbPath(navigationId: string, itemId: string): NavigationItem[] {
    const subject = this.navigations.get(navigationId);
    if (!subject) return [];

    const current = subject.value;
    const path: NavigationItem[] = [];
    
    const findPath = (items: NavigationItem[], targetId: string): boolean => {
      for (const item of items) {
        if (item.id === targetId) {
          path.unshift(item);
          return true;
        }
        
        if (item.children) {
          if (findPath(item.children, targetId)) {
            path.unshift(item);
            return true;
          }
        }
      }
      return false;
    };

    findPath(current.items, itemId);
    return path;
  }

  /**
   * Filtra ítems por permisos
   */
  filterByPermissions(navigationId: string, userPermissions: string[]): NavigationItem[] {
    const subject = this.navigations.get(navigationId);
    if (!subject) return [];

    const current = subject.value;
    
    const filterItems = (items: NavigationItem[]): NavigationItem[] => {
      return items
        .filter(item => {
          // Si no tiene restricciones de permisos, mostrar
          if (!item.permissions || item.permissions.length === 0) return true;
          
          // Verificar si el usuario tiene al menos un permiso requerido
          return item.permissions.some(permission => 
            userPermissions.includes(permission)
          );
        })
        .map(item => ({
          ...item,
          children: item.children ? filterItems(item.children) : undefined
        }));
    };

    return filterItems(current.items);
  }

  /**
   * Busca ítems por texto
   */
  searchItems(navigationId: string, searchText: string): NavigationItem[] {
    const subject = this.navigations.get(navigationId);
    if (!subject) return [];

    const current = subject.value;
    const results: NavigationItem[] = [];
    
    const search = (items: NavigationItem[]) => {
      items.forEach(item => {
        if (item.label.toLowerCase().includes(searchText.toLowerCase())) {
          results.push(item);
        }
        if (item.children) {
          search(item.children);
        }
      });
    };

    search(current.items);
    return results;
  }

  // Métodos auxiliares privados
  private findItemById(items: NavigationItem[], id: string): NavigationItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = this.findItemById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  private updateItemState(items: NavigationItem[], itemId: string, state: Partial<NavigationItem>): boolean {
    for (const item of items) {
      if (item.id === itemId) {
        Object.assign(item, state);
        return true;
      }
      if (item.children && this.updateItemState(item.children, itemId, state)) {
        return true;
      }
    }
    return false;
  }

  private deactivateAllItems(items: NavigationItem[]): void {
    items.forEach(item => {
      item.isActive = false;
      if (item.children) {
        this.deactivateAllItems(item.children);
      }
    });
  }

  private activateItemAndExpandParents(items: NavigationItem[], itemId: string): boolean {
    for (const item of items) {
      if (item.id === itemId) {
        item.isActive = true;
        return true;
      }
      if (item.children) {
        if (this.activateItemAndExpandParents(item.children, itemId)) {
          item.isExpanded = true;
          return true;
        }
      }
    }
    return false;
  }

  private updateItemInTree(items: NavigationItem[], itemId: string, updates: Partial<NavigationItem>): boolean {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === itemId) {
        items[i] = { ...items[i], ...updates };
        return true;
      }
      if (items[i].children) {
        if (this.updateItemInTree(items[i].children!, itemId, updates)) {
          return true;
        }
      }
    }
    return false;
  }

  private removeItemFromTree(items: NavigationItem[], itemId: string): NavigationItem[] {
    return items.filter(item => {
      if (item.id === itemId) return false;
      if (item.children) {
        item.children = this.removeItemFromTree(item.children, itemId);
      }
      return true;
    });
  }
}