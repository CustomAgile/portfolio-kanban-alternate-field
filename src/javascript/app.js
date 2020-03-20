Ext.define("TSPortfolioKanbanAlternateFieldApp", {
    extend: 'Rally.app.App',
    requires: [
        'Rally.apps.kanban.Settings',
        'Rally.apps.kanban.Column',
        'Rally.ui.gridboard.GridBoard',
        'Rally.ui.gridboard.plugin.GridBoardAddNew',
        'Rally.ui.gridboard.plugin.BoardPolicyDisplayable',
        'Rally.ui.cardboard.plugin.ColumnPolicy',
        'Rally.ui.cardboard.PolicyContainer',
        'Rally.ui.cardboard.CardBoard',
        'Rally.ui.cardboard.plugin.Scrollable',
        'Rally.ui.report.StandardReport',
        'Rally.clientmetrics.ClientMetricsRecordable',
        'Rally.ui.gridboard.plugin.GridBoardCustomFilterControl',
        'Rally.ui.gridboard.plugin.GridBoardFieldPicker',
        'Rally.ui.cardboard.plugin.FixedHeader'
    ],
    mixins: [
        'Rally.clientmetrics.ClientMetricsRecordable'
    ],
    cls: 'kanban',
    logger: new Rally.technicalservices.Logger(),

    appName: 'Kanban',

    settingsScope: 'project',
    // autoScroll: false,

    layout: {
        type: 'vbox',
        align: 'stretch'
    },

    items: [{
        id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
        xtype: 'container',
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    }, {
        id: Utils.AncestorPiAppFilter.PANEL_RENDER_AREA_ID,
        xtype: 'container',
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    }, {
        id: 'grid-area',
        itemId: 'grid-area',
        xtype: 'container',
        flex: 1,
        type: 'vbox',
        align: 'stretch'
    }],

    config: {
        defaultSettings: {
            groupByField: 'InvestmentCategory',
            showRows: false,
            columns: Ext.JSON.encode({
                None: { wip: '' }
            }),
            cardFields: 'FormattedID,Name,Owner,Discussion', //remove with COLUMN_LEVEL_FIELD_PICKER_ON_KANBAN_SETTINGS
            hideReleasedCards: false,
            showCardAge: true,
            cardAgeThreshold: 3,
            pageSize: 25,
            modelType: null
        }
    },

    launch: function () {
        var modelType = this.getSetting('modelType');
        this.filterDeferred = Ext.create('Deft.Deferred');

        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            settingsConfig: {},
            whiteListFields: ['Tags', 'Milestones', 'c_EnterpriseApprovalEA', 'c_EAEpic'],
            filtersHidden: false,
            visibleTab: modelType,
            listeners: {
                scope: this,
                ready(plugin) {
                    plugin.addListener({
                        scope: this,
                        select: this._addCardboardContent,
                        change: this._addCardboardContent
                    });
                    this.filterDeferred.resolve();
                },
            }
        });
        this.addPlugin(this.ancestorFilterPlugin);

        if (!modelType) {
            this.down('#grid-area').add({
                xtype: 'container',
                html: '<div class="no-data-container">Please set up the configuration settings in the board.<div class="secondary-message">'
            });
            return;
        }

        this.down('#grid-area').on('resize', this.resizeBoard, this);

        this.setLoading(true);

        Rally.data.ModelFactory.getModel({
            type: modelType,
            success: this._onModelRetrieved,
            scope: this
        });
    },

    resizeBoard: function () {
        let gridArea = this.down('#grid-area');
        let gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },

    getOptions: function () {
        return [
            {
                text: 'Print',
                handler: this._print,
                scope: this
            }
        ];
    },

    getSettingsFields: function () {
        return Rally.apps.kanban.Settings.getFields({
            shouldShowColumnLevelFieldPicker: this._shouldShowColumnLevelFieldPicker(),
            defaultCardFields: this.getSetting('cardFields'),
            modelType: this.getSetting('modelType')
        });
    },

    /**
     * Called when any timebox scope change is received.
     * @protected
     * @param {Rally.app.TimeboxScope} timeboxScope The new scope
     */
    onTimeboxScopeChange: function (timeboxScope) {
        this.callParent(arguments);
        this.gridboard.destroy();
        this.launch();
    },

    _shouldShowColumnLevelFieldPicker: function () {
        return this.getContext().isFeatureEnabled('COLUMN_LEVEL_FIELD_PICKER_ON_KANBAN_SETTINGS');
    },

    _onModelRetrieved: function (model) {
        this.logger.log("_onModelRetrieved", model);

        this.modelTypePath = model.typePath;
        this.groupByField = model.getField(this.getSetting('groupByField'));

        this.filterDeferred.promise.then({
            success() {
                this._addCardboardContent();
            },
            scope: this
        });
    },

    _addCardboardContent: async function () {
        this.logger.log('_addCardboardContent');

        this.setLoading(true);

        if (this.gridboard) { this.gridboard.destroy(); }

        var cardboardConfig = this._getCardboardConfig();
        let gridboardConfig = await this._getGridboardConfig(cardboardConfig);

        if (!gridboardConfig.storeConfig.filters) {
            return;
        }

        var columnSetting = this._getColumnSetting();

        if (columnSetting) {
            cardboardConfig.columns = this._getColumnConfig(columnSetting);
        }

        this.logger.log('config:', gridboardConfig);

        if (!this.rendered) {
            this.on('render', function () {
                this.gridboard = this.down('#grid-area').add(gridboardConfig);
            }, this);
        } else {
            this.gridboard = this.down('#grid-area').add(gridboardConfig);
        }
    },

    _getGridboardConfig: async function (cardboardConfig) {
        var context = this.getContext(),
            modelNames = this._getDefaultTypes(),
            blacklist = ['Successors', 'Predecessors', 'DisplayColor'],
            // height = this.down('#grid-area').getHeight(),
            typeName = modelNames[0].replace('PortfolioItem/', '');

        let dataContext = context.getDataContext();

        if (this.searchAllProjects()) {
            dataContext.project = null;
        }

        let filters = await this._getFilters();

        return {
            xtype: 'rallygridboard',
            stateful: false,
            toggleState: 'board',
            cardBoardConfig: cardboardConfig,
            plugins: [
                {
                    ptype: 'rallygridboardaddnew',
                    addNewControlConfig: {
                        margin: '0 15 0 0',
                        fieldLabel: "New " + typeName,
                        listeners: {
                            beforecreate: this._onBeforeCreate,
                            beforeeditorshow: this._onBeforeEditorShow,
                            scope: this
                        },
                        stateful: true,
                        stateId: context.getScopedStateId('kanban-add-new')
                    }
                },
                {
                    ptype: 'rallygridboardinlinefiltercontrol',
                    inlineFilterButtonConfig: {
                        stateful: true,
                        stateId: context.getScopedStateId('kanban-filter-hidden'),
                        hidden: true,
                        modelNames: modelNames,
                        margin: '3 9 3 30',
                        inlineFilterPanelConfig:
                        {
                            collapsed: false,
                            hidden: true,
                            quickFilterPanelConfig: {
                                hidden: true,
                                defaultFields: [],
                                addQuickFilterConfig: {
                                    whiteListFields: ['Tags', 'Milestones', 'c_EnterpriseApprovalEA', 'c_EAEpic']
                                }
                            }
                        }
                    }
                },
                {
                    ptype: 'rallygridboardfieldpicker',
                    headerPosition: 'left',
                    boardFieldBlackList: blacklist,
                    modelNames: modelNames,
                    boardFieldDefaults: this.getSetting('cardFields').split(',')
                },
                {
                    ptype: 'rallyboardpolicydisplayable',
                    prefKey: 'kanbanAgreementsChecked',
                    checkboxConfig: {
                        boxLabel: 'Show Agreements'
                    }
                }
            ],
            context: context,
            modelNames: modelNames,
            storeConfig: {
                filters,
                context: dataContext,
                enablePostGet: true
            },
            // height: height
        };
    },

    _getColumnConfig: function (columnSetting) {
        var columns = [];
        Ext.Object.each(columnSetting, function (column, values) {
            var columnConfig = {
                xtype: 'kanbancolumn',
                enableWipLimit: true,
                wipLimit: values.wip,
                plugins: [{
                    ptype: 'rallycolumnpolicy',
                    app: this
                }],
                value: values.type == 'state' || column == "" ? values.ref : column,
                columnHeaderConfig: {
                    headerTpl: column || 'None'
                },
                listeners: {
                    invalidfilter: {
                        fn: this._onInvalidFilter,
                        scope: this
                    }
                }
            };
            if (this._shouldShowColumnLevelFieldPicker()) {
                columnConfig.fields = this._getFieldsForColumn(values);
            }
            columns.push(columnConfig);
        }, this);

        columns[columns.length - 1].hideReleasedCards = this.getSetting('hideReleasedCards');

        return columns;
    },

    _getFieldsForColumn: function (values) {
        var columnFields = [];
        if (this._shouldShowColumnLevelFieldPicker()) {
            if (values.cardFields) {
                columnFields = values.cardFields.split(',');
            } else if (this.getSetting('cardFields')) {
                columnFields = this.getSetting('cardFields').split(',');
            }
        }
        return columnFields;
    },

    _onInvalidFilter: function () {
        Rally.ui.notify.Notifier.showError({
            message: 'Invalid query: ' + this.getSetting('query')
        });
    },

    _getCardboardConfig: function () {
        let context = this.getContext().getDataContext();

        if (this.searchAllProjects()) {
            context.project = null;
        }

        var config = {
            xtype: 'rallycardboard',
            plugins: [
                { ptype: 'rallycardboardprinting', pluginId: 'print' },
                {
                    ptype: 'rallyscrollablecardboard',
                    containerEl: this.getEl()
                },
                { ptype: 'rallyfixedheadercardboard' }
            ],
            types: this._getDefaultTypes(),
            attribute: this.getSetting('groupByField'),
            margin: '10px',
            context: this.getContext(),
            listeners: {
                beforecarddroppedsave: this._onBeforeCardSaved,
                load: this._onBoardLoad,
                cardupdated: this._publishContentUpdatedNoDashboardLayout,
                scope: this
            },
            columnConfig: {
                xtype: 'rallycardboardcolumn',
                enableWipLimit: true
            },
            cardConfig: {
                editable: true,
                showIconMenus: true,
                showAge: this.getSetting('showCardAge') ? this.getSetting('cardAgeThreshold') : -1,
                showBlockedReason: true
            },
            storeConfig: {
                context,
                enablePostGet: true
            }
        };

        if (this.getSetting('showRows')) {
            Ext.merge(config, {
                rowConfig: {
                    field: this.getSetting('rowsField'),
                    sortDirection: 'ASC'
                }
            });
        }

        return config;
    },

    _getFilters: async function () {
        var filters = [];
        let loadingFailed = false;
        if (this.getSetting('query')) {
            filters.push(Rally.data.QueryFilter.fromQueryString(this.getSetting('query')));
        }
        if (this.getContext().getTimeboxScope()) {
            filters.push(this.getContext().getTimeboxScope().getQueryFilter());
        }

        let ancestorAndMultiFilters = await this.ancestorFilterPlugin.getAllFiltersForType(this.modelTypePath, true).catch((e) => {
            Rally.ui.notify.Notifier.showError({ message: (e.message || e) });
            loadingFailed = true;
        });

        if (loadingFailed) {
            return null;
        }

        if (ancestorAndMultiFilters) {
            filters = filters.concat(ancestorAndMultiFilters);
        }
        return filters;
    },

    _getColumnSetting: function () {
        var columnSetting = this.getSetting('columns');
        return columnSetting && Ext.JSON.decode(columnSetting);
    },
    _print: function () {
        this.gridboard.getGridOrBoard().openPrintPage({ title: 'Kanban Board' });
    },

    _getDefaultTypes: function () {
        return [this.getSetting('modelType')];
        //        return ['User Story', 'Defect'];
    },

    _buildStandardReportConfig: function (reportConfig) {
        var scope = this.getContext().getDataContext();
        return {
            xtype: 'rallystandardreport',
            padding: 10,
            project: scope.project,
            projectScopeUp: scope.projectScopeUp,
            projectScopeDown: scope.projectScopeDown,
            reportConfig: reportConfig
        };
    },

    _showReportDialog: function (title, reportConfig) {
        var height = 450, width = 600;
        this.getEl().mask();
        Ext.create('Rally.ui.dialog.Dialog', {
            title: title,
            autoShow: true,
            draggable: false,
            closable: true,
            modal: false,
            height: height,
            width: width,
            items: [
                Ext.apply(this._buildStandardReportConfig(reportConfig),
                    {
                        height: height,
                        width: width
                    })
            ],
            listeners: {
                close: function () {
                    this.getEl().unmask();
                },
                scope: this
            }
        });
    },

    _onBoardLoad: function () {
        this._publishContentUpdated();
        this.setLoading(false);
        this.resizeBoard();
    },

    _onBeforeCreate: function (addNew, record, params) {
        Ext.apply(params, {
            rankTo: 'BOTTOM',
            rankScope: 'BACKLOG'
        });
        record.set(this.getSetting('groupByField'), this.gridboard.getGridOrBoard().getColumns()[0].getValue());
    },

    _onBeforeEditorShow: function (addNew, params) {
        params.rankTo = 'BOTTOM';
        params.rankScope = 'BACKLOG';
        params.iteration = 'u';

        var groupByFieldName = this.groupByField.name;

        params[groupByFieldName] = this.gridboard.getGridOrBoard().getColumns()[0].getValue();
    },

    _onBeforeCardSaved: function (column, card, type) {
        var columnSetting = this._getColumnSetting();
        if (columnSetting) {
            var setting = columnSetting[column.getValue() || ""];
            if (setting && (setting.portfolioStateMapping || setting.portfolioStateMapping === "")) {
                card.getRecord().set('State', setting.portfolioStateMapping);
            }
        }
    },

    searchAllProjects() {
        return this.ancestorFilterPlugin.getIgnoreProjectScope();
    },

    _publishContentUpdated: function () {
        this.fireEvent('contentupdated');
        if (Rally.BrowserTest) {
            Rally.BrowserTest.publishComponentReady(this);
        }
        this.recordComponentReady({
            miscData: {
                swimLanes: this.getSetting('showRows'),
                swimLaneField: this.getSetting('rowsField')
            }
        });
    },

    _publishContentUpdatedNoDashboardLayout: function () {
        this.fireEvent('contentupdated', { dashboardLayout: false });
    },

    isExternal: function () {
        return typeof (this.getAppId()) == 'undefined';
    },
});
