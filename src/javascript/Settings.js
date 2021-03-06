Ext.define('Rally.apps.kanban.Settings', {
    singleton: true,
    requires: [
        'Rally.apps.kanban.ColumnSettingsField',
        'Rally.apps.common.RowSettingsField',
        'Rally.ui.combobox.FieldComboBox',
        'Rally.ui.CheckboxField',
        'Rally.ui.plugin.FieldValidationUi'
    ],

    getFields: function (config) {
        var items = [
            {
                name: 'modelType',
                xtype: 'rallyportfolioitemtypecombobox',
                bubbleEvents: ['modelselected'],
                fieldLabel: 'Portfolio Item Type',
                valueField: 'TypePath',
                listeners: {
                    change: function (cb) {
                        if (cb.getRecord() && cb.getRecord().get('TypePath')) {
                            var model = cb.getRecord().get('TypePath');
                            this.fireEvent('modelselected', model);
                        }
                    }
                }
            }, {
                name: 'groupByField',
                xtype: 'rallyfieldcombobox',
                model: Ext.identityFn(config.modelType),
                margin: '10px 0 0 0',
                fieldLabel: 'Columns',
                listeners: {
                    select: function (combo) {
                        this.fireEvent('fieldselected', combo.getRecord().get('fieldDefinition'));
                    },
                    ready: function (combo) {
                        combo.store.filterBy(function (record) {
                            var attr = record.get('fieldDefinition').attributeDefinition;
                            let whitelist = ['c_AuthPortfolioKanban', 'c_NEMOKanbanState', 'c_CFRKanbanState'];
                            // if(attr.AttributeType !== 'OBJECT'){
                            //     console.log('OBJECT>>',record.get('value'));
                            // }
                            // return attr && !attr.ReadOnly && attr.Constrained && attr.AttributeType !== 'OBJECT' && attr.AttributeType !== 'COLLECTION';
                            return _.contains(whitelist, record.get('value')) || (attr && !attr.ReadOnly && attr.Constrained && attr.AttributeType !== 'COLLECTION');
                        });
                        if (combo.getRecord()) {
                            this.fireEvent('fieldselected', combo.getRecord().get('fieldDefinition'));
                        }
                    }
                },
                handlesEvents: {
                    select: function (cb) {

                        if (cb.getRecord() && cb.getRecord().get('TypePath')) {
                            var selectedField = this.getValue();
                            this.refreshWithNewModelType(cb.getRecord().get('TypePath'));
                            this.setValue(selectedField);
                        }

                    },
                    modelselected: function (model) {
                        var selectedField = this.getValue();
                        this.refreshWithNewModelType(model);
                        this.setValue(selectedField);

                    }
                },
                bubbleEvents: ['fieldselected', 'fieldready']
            },

            {
                name: 'columns',
                readyEvent: 'ready',
                fieldLabel: '',
                margin: '5px 0 0 80px',
                xtype: 'kanbancolumnsettingsfield',
                shouldShowColumnLevelFieldPicker: config.shouldShowColumnLevelFieldPicker,
                defaultCardFields: config.defaultCardFields,
                modelType: config.modelType,
                handlesEvents: {
                    fieldselected: function (field) {
                        this.refreshWithNewField(field);
                    },
                    modelselected: function (model) {
                        this.refreshWithNewModel(model);
                    }
                },
                listeners: {
                    ready: function () {
                        this.fireEvent('columnsettingsready');
                    }
                },
                bubbleEvents: 'columnsettingsready'
            }
        ];

        items.push({
            name: 'groupHorizontallyByField',
            xtype: 'rowsettingsfield',
            fieldLabel: 'Swimlanes',
            margin: '10 0 0 0',
            mapsToMultiplePreferenceKeys: ['showRows', 'rowsField'],
            readyEvent: 'ready',
            isAllowedFieldFn: function (field) {
                var attr = field.attributeDefinition;
                console.log('field', field.name, attr);
                return (attr.Custom && (attr.Constrained || attr.AttributeType.toLowerCase() !== 'string') ||
                    attr.Constrained || field.name === "Parent" || _.contains(['boolean'], attr.AttributeType.toLowerCase())) &&
                    !_.contains(['web_link', 'text', 'date'], attr.AttributeType.toLowerCase());
            },
            explicitFields: [
                { name: 'Sizing', value: 'PlanEstimate' }
            ]
        });

        let model = Rally.getApp().getSetting('modelType');

        items.push(
            {
                name: 'hideReleasedCards',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Options',
                margin: '10 0 0 0',
                boxLabel: 'Hide cards in last visible column if assigned to a release',
                disabled: model && model.toLowerCase().indexOf('feature') === -1,
                handlesEvents: {
                    modelselected: function (model) {
                        if (model && model.toLowerCase().indexOf('feature') > -1) {
                            this.enable();
                        }
                        else {
                            this.disable();
                        }
                    }
                }
            },
            {
                type: 'cardage',
                config: {
                    fieldLabel: '',
                    margin: '5 0 10 80'
                }
            },
            {
                type: 'query'
            });

        return items;
    }
});