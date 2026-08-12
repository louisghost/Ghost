import useSortableIndexedList from '@/settings/app/hooks/use-sortable-indexed-list';
import validator from 'validator';
import {useCallback, useMemo} from 'react';

export type NavigationItem = {
    label: string;
    url: string;
}

export type NavigationItemErrors = { [key in keyof NavigationItem]?: string }
export type EditableItem = NavigationItem & { id: string; errors: NavigationItemErrors }

const hasNewItem = (newItem: NavigationItem) => Boolean((newItem.label && !newItem.label.match(/^\s*$/)) || newItem.url);

export type NavigationEditor = {
    items: EditableItem[]
    updateItem: (id: string, item: Partial<NavigationItem>) => void
    addItem: (overrides?: Partial<NavigationItem>) => void
    removeItem: (id: string) => void
    moveItem: (activeId: string, overId?: string) => void
    newItem: EditableItem
    setNewItem: (item: Partial<NavigationItem>) => void
    clearError: (id: string, key: keyof NavigationItem) => void
    validate: () => boolean
}

const useNavigationEditor = ({items, setItems}: {
    items: NavigationItem[];
    setItems: (newItems: NavigationItem[]) => void;
}): NavigationEditor => {
    const editableItems = useMemo(() => items.map(item => ({...item, errors: {}})), [items]);
    const setNavigationItems = useCallback((newItems: Omit<EditableItem, 'id'>[]) => {
        setItems(newItems.map(({url, label}) => ({url, label})));
    }, [setItems]);

    const list = useSortableIndexedList<Omit<EditableItem, 'id'>>({
        items: editableItems,
        setItems: setNavigationItems,
        // Blank rather than '/' so the URL field starts empty and the suggestion
        // dropdown is the obvious way in, instead of prefilling the site root
        blank: {url: '', label: '', errors: {}},
        canAddNewItem: hasNewItem
    });

    const urlRegex = new RegExp(/^(\/|#|[a-zA-Z0-9-]+:)/);

    const validateItem = (item: NavigationItem) => {
        const errors: NavigationItemErrors = {};

        if (!item.label || item.label.match(/^\s*$/)) {
            errors.label = 'You must specify a label';
        }

        if (!item.url || item.url.match(/\s/) || (!validator.isURL(item.url, {require_protocol: true}) && !item.url.match(urlRegex))) {
            errors.url = 'You must specify a valid URL or relative path';
        }

        return errors;
    };

    const updateItem = (id: string, item: Partial<NavigationItem>) => {
        const currentItem = list.items.find(current => current.id === id)!;
        list.updateItem(id, {...currentItem.item, ...item});
    };

    // `overrides` let a caller submit a value it has just committed but which
    // hasn't flushed into `list.newItem` yet — pressing Enter in the URL field
    // commits and adds within a single event.
    const addItem = (overrides?: Partial<NavigationItem>) => {
        const candidate = {...list.newItem, ...overrides};
        const errors = validateItem(candidate);

        if (Object.values(errors).some(message => message)) {
            list.setNewItem({...candidate, errors});
        } else {
            list.addItem(overrides);
        }
    };

    const removeItem = (id: string) => {
        list.removeItem(id);
    };

    const moveItem = (activeId: string, overId?: string) => {
        list.moveItem(activeId, overId);
    };

    const newItemId = 'new';

    const clearError = (id: string, key: keyof NavigationItem) => {
        if (id === newItemId) {
            list.setNewItem({...list.newItem, errors: {...list.newItem.errors, [key]: undefined}});
        } else {
            const currentItem = list.items.find(current => current.id === id)!.item;
            list.updateItem(id, {...currentItem, errors: {...currentItem.errors, [key]: undefined}});
        }
    };

    return {
        items: list.items.map(({item, id}) => ({...item, id})),

        updateItem,
        addItem,
        removeItem,
        moveItem,

        newItem: {...list.newItem, id: newItemId},
        setNewItem: item => list.setNewItem({...list.newItem, ...item}),

        clearError,
        validate: () => {
            let isValid = true;

            list.items.forEach(({item, id}) => {
                const errors = validateItem(item);

                if (Object.values(errors).some(message => message)) {
                    isValid = false;
                    list.updateItem(id, {...item, errors});
                }
            });

            if (hasNewItem(list.newItem)) {
                const newItemErrors = validateItem(list.newItem);

                if (Object.values(newItemErrors).some(message => message)) {
                    isValid = false;
                    list.setNewItem({...list.newItem, errors: newItemErrors});
                }
            }

            return isValid;
        }
    };
};

export default useNavigationEditor;
